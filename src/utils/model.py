import polars
import xgboost
import mmh3
import numpy
import random
import onnxmltools
import psycopg2
from dotenv import load_dotenv
import os

load_dotenv()
VECTOR_SIZE = 65536
DATABASE_URL = os.getenv("DATABASE_URL")

def fetch_items():
  query = """
  select
    ol.price,
    array_remove(array_agg(distinct t.name), null) as tags,
    sum(ol.quantity) as volume
  from
    order_lines ol
  left join
    item_tags it on ol.item_id = it.item_id
  left join
    tags t on it.tag_id = t.id
  group by
    ol.item_id, ol.price
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

df = fetch_items()
print(df)

