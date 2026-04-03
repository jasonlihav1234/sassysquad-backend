from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from model import SaasySquadModel
import os

app = FastAPI()
predictor = SaasySquadModel()

try:
  predictor.load(path="./models")
except Exception as e:
  print("Not existing models found")

class EstimateRequest(BaseModel):
  tags: str
  category: str

@app.post("/predict")
def predict_market(req: EstimateRequest):
  if not predictor.trained:
    raise HTTPException(status_code=400, detail="Model not trained yet")

  try:
    result = predictor.estimate_market(req.tags, req.category)
    return result
  except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))
  
@app.post("/train")
def train_model():
  try:
    predictor.train_model()
    predictor.save(path="./models/")
    return {
      "status": "Retrained and saved model"
    }
  except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))
