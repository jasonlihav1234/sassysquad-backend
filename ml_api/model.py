import numpy
import psycopg2
from dotenv import load_dotenv
import os
from vercel.blob import UploadProgressEvent, BlobClient, AsyncBlobClient
from pygam import LinearGAM, s, l
import pandas
import sys
import json
import joblib

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

    X_sim = pandas.DataFrame(sim_data)[self.feature_columns]

    raw_volumes = self.vol_model.predict(X_sim.values)
    volumes = numpy.maximum(0, numpy.round(raw_volumes).astype(int))

    revenues = test_prices * volumes

    max_rev = numpy.max(revenues)
    if max_rev <= 0:
      return { "status": "No Market Demand" }
    
    profit_zone_indices = numpy.where(revenues >= (max_rev * 0.90))[0]
    safe_prices = test_prices[profit_zone_indices]
    safe_volumes = volumes[profit_zone_indices]
    optimal_idx = numpy.argmax(revenues)

    return {
      "status": "Success",
      "optimal_price": round(test_prices[optimal_idx], 2),
      "max_expected_revenue": round(max_rev, 2),
      "suggested_price_range": (round(safe_prices.min(), 2), round(safe_prices.max(), 2)),
      "expected_monthly_volume": (int(safe_volumes.max()), int(safe_volumes.min()))
    }
  
  def save(self, path="models/"):
    os.makedirs(path, exist_ok=True)
    joblib.dump(self.vol_model, f"{path}vol_model.pkl")
    joblib.dump(self.feature_columns, f"{path}features.pkl")
    joblib.dump(self.global_p99, f"{path}p99.pkl")

  def load(self, path="models/"):
    if os.path.exists(f"{path}vol_model.pkl"):
      self.vol_model = joblib.load(f"{path}vol_model.pkl")
      self.feature_columns = joblib.load(f"{path}features.pkl")
      self.global_p99 = joblib.load(f"{path}p99.pkl")
      self.trained = True

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

