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

