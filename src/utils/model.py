import polars
import xgboost
import mmh3
import numpy
import random
import onnxmltools
import psycopg2
from dotenv import load_dotenv
from onnxmltools.convert.common.data_types import FloatTensorType
import os
from vercel.blob import UploadProgressEvent, BlobClient, AsyncBlobClient
from datetime import datetime
import asyncio
import json

load_dotenv()
VECTOR_SIZE = 65536
DATABASE_URL = os.getenv("DATABASE_URL")

def on_progress(e: UploadProgressEvent) -> None:
  print(f"progress: {e.loaded}/{e.total} bytes ({e.percentage}%)")

async def handler(onnx_file, metadata_dict):
  client = AsyncBlobClient()
  now = datetime.now()
  metadata_bytes = json.dumps(metadata_dict).encode("utf-8");

  uploaded = await client.put(
    f"onnx_files/saasysquad_model.onnx",
    onnx_file,
    access="private",
    on_upload_progress=on_progress
  )

  metadata_task = await client.put(
    "onnx_files/model_metadata.json",
    metadata_bytes,
    access="private",
    on_upload_progress=on_progress
  )

  return {
    "onnx_url": uploaded.url,
    "pathname": uploaded.pathname
  }

def fetch_items():
  query = """
  select
    ol.price_at_purchase,
    array_remove(array_agg(distinct t.tag_name), null) as tags,
    sum(ol.quantity) as volume
  from
    order_lines ol
  left join
    item_tags it on ol.item_id = it.item_id
  left join
    tags t on it.tag_id = t.tag_id
  group by
    ol.item_id, ol.price_at_purchase
  """

  with psycopg2.connect(DATABASE_URL) as conn:
    with conn.cursor() as cur:
      cur.execute(query)
      records = cur.fetchall()

      return polars.DataFrame(
        records,
        schema=["price", "tags", "volume"],
        orient="row"
      )

def hash_tags_to_vector(price, tags):
  vector = numpy.zeros(VECTOR_SIZE, dtype=numpy.float32)
  vector[0] = price

  for tag in tags:
    clean_tag = tag.lower().strip()
    hash_index = (mmh3.hash(clean_tag, signed=False) % (VECTOR_SIZE - 1)) + 1
    vector[hash_index] = 1.0
  
  return vector

df = fetch_items()
print(df)
P99_PRICE = df["price"].quantile(0.99);
outlier_df = df.filter(polars.col("price") > P99_PRICE)

if len(outlier_df) > 0:
  OUTLIER_AVG_VOLUME = int(outlier_df["volume"].mean())
else:
  OUTLIER_AVG_VOLUME = 0

print(f"--- 99th Percentile is ${P99_PRICE:.2f} ---")
print(f"--- Outlier Average is {OUTLIER_AVG_VOLUME} units ---\n")

X_list = []

for row in df.iter_rows(named=True):
  vector = hash_tags_to_vector(row["price"], row["tags"])
  X_list.append(vector)

X = numpy.array(X_list, dtype=numpy.float32)
y = df["volume"].to_numpy()

xgb_model = xgboost.XGBRegressor(n_estimators=100,
                                 max_depth=5,
                                 learning_rate=0.1,
                                 objective="reg:squarederror")
xgb_model.fit(X, y)

print("Exporting model to ONNX")
initial_type = [("float_input", FloatTensorType([None, VECTOR_SIZE]))]
onnx_model = onnxmltools.convert_xgboost(xgb_model, initial_types=initial_type)
metadata = {
  "P99_PRICE": float(P99_PRICE),
  "OUTLIER_AVG_VOLUME": OUTLIER_AVG_VOLUME
}

def predict_and_report(price: float, tags: list[str]):
    print("="*55)
    print(f" 🚀 QUERY: ${price:.2f} | Tags: {tags}")
    print("="*55)

    # CHECK 1: Does this exceed our 99th percentile?
    if price > P99_PRICE:
        print("Routing logic  : Price exceeds 99% of historical platform data.")
        print("Model selected : Outlier Fallback (Avg of Top 1% Catalog)")
        print(f"Final Volume   : {OUTLIER_AVG_VOLUME} units")
        print("="*55 + "\n")
        return

    # CHECK 2: Normal prediction for the other 99% of queries
    vector = numpy.array([hash_tags_to_vector(price, tags)], dtype=numpy.float32)
    raw_pred = xgb_model.predict(vector)[0]
    final_volume = max(0, int(raw_pred))
    
    print("Routing logic  : Price is within normal bounds.")
    print("Model selected : XGBoost (Contextual ML)")
    print(f"Final Volume   : {final_volume} units")
    print("="*55 + "\n")


predict_and_report(3800, ["rattan", "floating", "geometric"])

result = asyncio.run(handler(onnx_model.SerializeToString(), metadata))
print(result)
