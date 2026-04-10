import numpy
import psycopg2
import os
from pygam import LinearGAM, s, l
import pandas
import sys
import json
import joblib

class SaasySquadModel:
  def __init__(self):
    # holds the actual mathemetical engine (LinearGAM algorithm) that predicts sales volume
    self.volume_model = None
    # master lsit of all column names the model used for learning (price, ...)
    # if you have Category apparel, tags - red, cotton
    # it will flatten to cat_apparel 1, cat_electronics 0, depending on which was selected
    self.feature_columns = None
    # holds the 99th percentile price of all historical items
    self.p99_price = None
    # says if model has been trained
    self.trained = False

  def load_and_preprocess(self):
    DATABASE_URL = os.environ.get("DATABASE_URL")

    # sales agg, looks at order history, groups everything by item_id, adds up total number sold, calculates average price paid
    # tags_agg, looks at item tags, squishes all individual tags into a single ccsv
    # final seelect takes sales totals and join tehm with tags, item details, and category names, coalesce as a safety net
    query = """
    with sales_agg as (
      select item_id,
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
      coalesce(t.tags, '') as tags,
      coalesce(c.category_name, 'unknown') as category_name
    from
      sales_agg s
    left join
      items i on s.item_id = i.item_id
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

    # dumps results into pandas.DataFrame (invisible Excel spreadsheet in computer memory)
    df = pandas.DataFrame(records, columns=col_names)
    # forces prices to be floats
    df["price"] = df["price"].astype(float)
    # forces quantity to be integers
    df["quantity_sold"] = df["quantity_sold"].astype(int)

    # should probably normalise the category names so match the database
    df["category_name"] = df["category_name"].str.strip().str.lower()

    # finds the 99th percentile price
    self.global_p99 = df["price"].quantile(0.99)
    # creates a dictionary recording highest normal price for every category, so model knows realistic ceiling
    self.category_max_prices = df.groupby("category_name")["price"].max().to_dict()

    # looks through columns and explodes them into dozens of individual yes/no columns
    df_tags = df["tags"].str.get_dummies(sep=',')
    df_category = pandas.get_dummies(df["category_name"], prefix="cat")

    # takes original price column, exploded tag columns, and exploded category columns, glues them together
    X = pandas.concat([df["price"], df_tags, df_category], axis=1)
    # isolates quantity sold as the target we want to predict
    y = df["quantity_sold"]

    return X, y
  
  def train_model(self):
    X, y = self.load_and_preprocess()

    # s = Spline (smooth, wavy curve), tells model to draw flexible curve to represent how this feature affects sales
    # 0 = look at column 0 in our data, because we glued our data, column 0 is our price
    # monotonic_dec = as price goes up, sales volume must strictly go down or stay flat
    gam_terms = s(0, constraints="monotonic_dec")
    # X.shape[1] = the number of columns, X.shape[0] = number of rows
    for i in range(1, X.shape[1]):
      # l() = simple linear rule
      # if it learns that cat_Electronics + 1 then add +20 to predicted sales
      # if it learns tag_refurbished is 1, subtract -5 from predicted sales
      gam_terms += l(i)

    # create brain usig blueprint of rules we created, smooth downward curve for price + flat bonuses from tags/categories
    self.vol_model = LinearGAM(gam_terms)
    # give your historical data and pass it to ml model
    self.vol_model.gridsearch(X.values, y.values)

    # saves master list of oclumn names, knows what format to expect in future
    self.feature_columns = X.columns.tolist()
    # flip internal state to true
    self.trained = True

  def estimate_market(self, tags, category):
    if not self.trained:
      return
    
    category = category.strip().lower()
    tags = tags.strip().lower()

    # creates a blank items with 50 empty slots or the number of feature columns
    base_dict = {col: 0 for col in self.feature_columns}

    for tag in tags.split(","):
      tag = tag.strip()
      # flip 1 for each tag that the person asks for
      if tag in base_dict:
        base_dict[tag] = 1
    # flip 1 for the category the user asks for
    cat_col = f"cat_{category}"
    if cat_col in base_dict:
      base_dict[cat_col] = 1

    # looks up high price, if every sold, adds a generous 5% buffer
    if category in self.category_max_prices:
      sim_limit = self.category_max_prices[category] * 1.05
    else:
      # else set the limit to highest ever sold
      sim_limit = self.global_p99

    # takes min price (1.0) and max price, generate 100 evenly spaced prices between them
    test_prices = numpy.linspace(1.0, sim_limit, num=100)

    # take single item and create 100 identical clones, slap a different price tag on each clone
    sim_data = [base_dict.copy() for _ in range(100)]
    for i, price in enumerate(test_prices):
      sim_data[i]["price"] = price

    # pack 100 clones into final grid
    X_sim = pandas.DataFrame(sim_data)[self.feature_columns]
    # pass it to ML model to predict
    raw_volumes = self.vol_model.predict(X_sim.values)
    # spits out 100 predictions, guessing how many units will sell at 100 price points
    # forces prediction numbers to be whole numbers, ensures number never drops below zero
    volumes = numpy.maximum(0, numpy.round(raw_volumes).astype(int))

    # price * predicted_volume = estimated revenue, predicts revenue for all 100 clones
    revenues = test_prices * volumes
    # find highest revenue
    max_rev = numpy.max(revenues)
    if max_rev <= 0:
      return { "status": "No Market Demand" }
    # find point where you get at least 90% of your maximum possible revenue
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

  # joblib saves them as pickle files permananently in the hard drive
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
