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
from pygam import LinearGAM, s, l
import pandas

load_dotenv()
VECTOR_SIZE = 65536
DATABASE_URL = os.getenv("DATABASE_URL")

class SaasySquadModel:
  def __init__(self):
    self.volume_model = None
    self.feature_columns = None
    self.p99_price = None
    self.trained = False

  def load_and_preprocess(self):
    query = """
    with sales_agg as (
      select item_id
        sum(quantity) as quantity_sold,
        avg(price_at_purchase) as price
      from
        order_lines
      group by
        item_id
    ),
    tags_agg as (
      select it.item_id,
        string_agg(t.tag_name, ',') as tags
      from
        item_tags it
      join tags t on
        it.tag_id = t.tag_id
      group by
        it.item_id
    )
    select
      s.item_id,
      s.quantity_sold,
      s.price,
      coalesece(t.tags, '') as tags,
      coalesce(c.category_name, 'unknown') as category_name
    from
      sales_agg s
    left join
      items i on s.itemid = i.item_id
    left join
      categories c on i.category_id = c.category_id
    left join
      tags_agg t on s.item_id = t.item_id
    """

    with psycopg2.connect(DATABASE_URL) as conn:
      with conn.cursor() as cur:
        cur.execute(query)
        records = cur.fetchall()

        col_names = [desc[0] for desc in cur.description]
      
    df = pandas.DataFrame(records, col_names)

    self.global_p99 = df["price"].quantile(0.99)
    self.category_max_prices = df.groupby("category_name")["price"].max().to_dict()

    df_tags = df["tags"].str.get_dummies(sep=',')
    df_category = pandas.get_dummies(df["category_name"], prefix="cat")

    X = pandas.concat([df["price"], df_tags, df_category], axis=1)
    y = df["quantity_sold"]

    return X, y
  
  def train_model(self):
    X, y = self.load_and_preprocess()

    gam_terms = s(0, constraints="monotonic_dec")

    for i in range(1, X.shape[1]):
      gam_terms += l(i)

    self.vol_model = LinearGAM(gam_terms)
    self.vol_model.gridsearch(X.values, y.values)

    self.feature_columns = X.columns.tolist()
    self.trained = True

  def estimate_market(self, tags, category):
    if not self.trained:
      return

    base_dict = {col: 0 for col in self.feature_columns}

    for tag in tags.split(","):
      tag = tag.strip()
      if tag in base_dict:
        base_dict[tag] = 1

    cat_col = f"cat_{category}"
    if cat_col in base_dict:
      base_dict[cat_col] = 1

    if category in self.category_max_prices:
      sim_limit = self.category_max_prices[category] * 1.05
    else:
      sim_limit = self.global_p99

    sim_limit = min(sim_limit, self.global_p99)
    test_prices = numpy.linspace(1.0, sim_limit, num=100)

    sim_data = [base_dict.copy() for _ in range(100)]
    for i, price in enumerate(test_prices):
      sim_data[i]["price"] = price

    X_sim = pandas.DataFrame()

    

def on_progress(e: UploadProgressEvent) -> None:
  print(f"progress: {e.loaded}/{e.total} bytes ({e.percentage}%)")

async def handler(onnx_file):
  client = AsyncBlobClient()

  uploaded = await client.put(
    f"onnx_files/saasysquad_model.onnx",
    onnx_file,
    access="private",
    on_upload_progress=on_progress
  )

  return {
    "url": uploaded.url,
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

result = asyncio.run(handler(onnx_model.SerializeToString()))
print(result)

