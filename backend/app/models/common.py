from datetime import date

from pydantic import BaseModel


class ChartPoint(BaseModel):
    date: date
    value: float
