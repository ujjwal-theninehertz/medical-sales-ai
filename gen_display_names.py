"""One-off generator for data/display_names.json (both backend/data/ and frontend/src/data/).

The real dataset uses placeholder-style identifiers for branch/route/supplier/product
("Medical Branch 01", "Route 01", "Medical Supplier 001", "Medical Product 0101"). This script
builds a fixed, deterministic real -> display-name mapping so the UI (and the client-facing
Excel export) can show plausible names instead, WITHOUT touching the underlying dataset or any
model/API logic -- every real identifier keeps working exactly as before; this mapping is
consulted only when rendering something to a person.

Re-run this only if the source CSV's branch/route/supplier/product lists ever change (new
branch added, etc.) -- otherwise the checked-in JSON files are the source of truth.
"""
import json
import os

import pandas as pd

_HERE = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(_HERE, 'backend', 'data', 'medical_sales_5yr_250k.csv')

df = pd.read_csv(DATA_PATH)

branches = sorted(df['stock_branch'].unique().tolist())
routes = sorted(df['route'].unique().tolist())
suppliers = sorted(df['supplier'].unique().tolist())
products = df[['product', 'product_type']].drop_duplicates().sort_values('product')

assert len(branches) == 15
assert len(routes) == 30
assert len(suppliers) == 30
assert len(products) == 200

# ---------- branches -> major Canadian cities ----------
CITIES = [
    'Toronto', 'Vancouver', 'Montreal', 'Calgary', 'Ottawa', 'Edmonton', 'Winnipeg',
    'Quebec City', 'Hamilton', 'Kitchener', 'London', 'Victoria', 'Halifax', 'Saskatoon',
    'Regina',
]
branch_map = {real: f'{city} Branch' for real, city in zip(branches, CITIES)}

# ---------- routes -> Canadian city/region route names (distinct pool from branches) ----------
ROUTE_PLACES = [
    "St. John's", 'Windsor', 'Oshawa', 'Barrie', 'Kelowna', 'Abbotsford', 'Sudbury',
    'Kingston', 'Saguenay', 'Trois-Rivieres', 'Guelph', 'Moncton', 'Brantford',
    'Thunder Bay', 'Sherbrooke', 'Red Deer', 'Nanaimo', 'Chilliwack', 'Peterborough',
    'Lethbridge', 'Belleville', 'Cornwall', 'Sarnia', 'North Bay', 'Medicine Hat',
    'Fredericton', 'Charlottetown', 'Yellowknife', 'Whitehorse', 'Iqaluit',
]
route_map = {real: f'{place} Route' for real, place in zip(routes, ROUTE_PLACES)}

# ---------- suppliers -> person names ----------
SUPPLIER_NAMES = [
    'James Wilson', 'Sarah Thompson', 'Michael Chen', 'Emily Rodriguez', 'David Kim',
    'Jessica Martinez', 'Robert Taylor', 'Amanda Clark', 'Daniel Lewis', 'Laura Walker',
    'Christopher Hall', 'Jennifer Young', 'Matthew Allen', 'Ashley King', 'Andrew Wright',
    'Nicole Scott', 'Joshua Green', 'Stephanie Baker', 'Ryan Adams', 'Melissa Nelson',
    'Brandon Carter', 'Rachel Mitchell', 'Justin Perez', 'Lauren Roberts', 'Kevin Turner',
    'Megan Phillips', 'Eric Campbell', 'Samantha Parker', 'Jason Evans', 'Michelle Edwards',
]
supplier_map = {real: name for real, name in zip(suppliers, SUPPLIER_NAMES)}

# ---------- products -> plausible medicine/device/supply names, grouped by product_type ----------
POOLS = {
    'Tablet': (
        [
            'Paracetamol', 'Ibuprofen', 'Amoxicillin', 'Azithromycin', 'Metformin',
            'Amlodipine', 'Atorvastatin', 'Losartan', 'Ciprofloxacin', 'Aspirin',
            'Diclofenac', 'Naproxen', 'Simvastatin', 'Levothyroxine', 'Clopidogrel',
            'Furosemide', 'Prednisone', 'Hydrochlorothiazide', 'Gabapentin', 'Sertraline',
            'Fluoxetine', 'Warfarin', 'Montelukast', 'Domperidone', 'Folic Acid',
            'Calcium Carbonate', 'Metoprolol', 'Ramipril',
        ],
        ' Tablet',
    ),
    'Capsule': (
        [
            'Metronidazole', 'Ranitidine', 'Pantoprazole', 'Doxycycline', 'Fluconazole',
            'Omeprazole', 'Esomeprazole', 'Rabeprazole', 'Cephalexin', 'Erythromycin',
            'Clindamycin', 'Tetracycline', 'Vitamin E', 'Fish Oil', 'Iron Polymaltose',
            'Multivitamin Mineral', 'Ashwagandha', 'Probiotic Blend', 'Coenzyme Q10',
            'Evening Primrose Oil', 'Ginseng Extract', 'Turmeric Curcumin', 'Garlic Extract',
            'Cod Liver Oil', 'Biotin Complex', 'Milk Thistle', 'Amoxicillin Clavulanate',
        ],
        ' Capsule',
    ),
    'OTC': (
        [
            'Vitamin C', 'Vitamin D3', 'Multivitamin', 'Zinc Sulfate', 'Calcium + Vitamin D',
            'Omega-3 Fish Oil', 'Probiotic Capsules', 'Iron Supplement', 'Biotin',
            'Glucosamine', 'Melatonin', 'Antacid Tablets', 'ORS Sachets', 'Hand Sanitizer',
            'First Aid Antiseptic Cream', 'Pain Relief Balm', 'Cough Drops',
            'Throat Lozenges', 'Nasal Spray', 'Eye Drops', 'Rehydration Salts',
            'Sunscreen SPF50', 'Lip Balm',
        ],
        '',
    ),
    'Syrup': (
        [
            'Cough Syrup', 'Paracetamol Syrup', 'Amoxicillin Suspension', 'Cetirizine Syrup',
            'Multivitamin Syrup', 'Iron Syrup', 'Zinc Syrup', 'Ambroxol Syrup',
            'Domperidone Syrup', 'Ondansetron Syrup', 'Calcium Syrup', 'Levocetirizine Syrup',
            'Salbutamol Syrup', 'Paracetamol Pediatric Drops', 'Vitamin D Drops',
            'ORS Solution', 'Antacid Syrup', 'Expectorant Syrup', 'Throat Relief Syrup',
            'Digestive Syrup', 'Appetite Syrup', 'Iron-Folic Syrup', 'Multivitamin Drops',
            'Cough Relief Syrup', 'Cold & Flu Syrup',
        ],
        '',
    ),
    'Injection': (
        [
            'Insulin', 'Diclofenac', 'Ceftriaxone', 'Vitamin B12', 'Tetanus Toxoid',
            'Dexamethasone', 'Hydrocortisone', 'Adrenaline', 'Heparin', 'Iron Sucrose',
            'Ondansetron', 'Metoclopramide', 'Ranitidine', 'Furosemide', 'Gentamicin',
            'Amikacin', 'Vancomycin', 'Pantoprazole', 'Tramadol', 'Diazepam', 'Midazolam',
            'Atropine', 'Calcium Gluconate', 'Magnesium Sulfate', 'Potassium Chloride',
            'Sodium Bicarbonate', 'Normal Saline', 'Dextrose', "Ringer's Lactate",
            'Immunoglobulin', 'Influenza Vaccine', 'Hepatitis B Vaccine', 'Vitamin K',
        ],
        ' Injection',
    ),
    'Medical Device': (
        [
            'Digital Thermometer', 'Blood Pressure Monitor', 'Glucometer', 'Pulse Oximeter',
            'Nebulizer', 'Stethoscope', 'Wheelchair', 'Hospital Bed', 'Walking Cane',
            'Crutches', 'Oxygen Concentrator', 'CPAP Machine', 'ECG Monitor',
            'Infusion Pump', 'Syringe Pump', 'Suction Machine', 'Patient Monitor',
            'Defibrillator', 'Otoscope', 'Ophthalmoscope', 'Weighing Scale',
            'Height Measure', 'Hot Water Bag', 'Ice Pack', 'Cervical Collar', 'Knee Brace',
            'Ankle Support', 'Elastic Bandage Roll', 'Hearing Aid', 'Nebulizer Mask Kit',
            'Wheelchair Cushion', 'Walker Frame',
        ],
        '',
    ),
    'Surgical Supply': (
        [
            'Surgical Gloves', 'Surgical Mask', 'N95 Respirator', 'Gauze Bandage',
            'Sterile Cotton', 'Adhesive Tape', 'Suture Kit', 'Scalpel Set', 'Surgical Gown',
            'Surgical Cap', 'Face Shield', 'Alcohol Swabs', 'Antiseptic Solution',
            'Iodine Solution', 'Syringe 5ml', 'Syringe 10ml', 'IV Cannula', 'Catheter Kit',
            'Surgical Drape', 'Gauze Sponge', 'Elastic Crepe Bandage', 'Cotton Roll',
            'Medical Tape', 'Wound Dressing', 'Sterile Gloves', 'Examination Gloves',
            'Surgical Blade', 'Skin Stapler', 'Ligature Clips', 'Surgical Thread',
            'Disposable Syringe', 'Bandage Scissors',
        ],
        '',
    ),
}

for ptype, (names, suffix) in POOLS.items():
    real_count = (products['product_type'] == ptype).sum()
    if len(names) < real_count:
        raise SystemExit(f'{ptype}: need {real_count} names, only have {len(names)}')

product_map = {}
for ptype, (names, suffix) in POOLS.items():
    real_rows = products[products['product_type'] == ptype]['product'].tolist()
    for real, base in zip(real_rows, names):
        product_map[real] = f'{base}{suffix}'

# ---------- sanity checks ----------
assert len(branch_map) == 15 and len(set(branch_map.values())) == 15
assert len(route_map) == 30 and len(set(route_map.values())) == 30
assert len(supplier_map) == 30 and len(set(supplier_map.values())) == 30
assert len(product_map) == 200, len(product_map)
assert len(set(product_map.values())) == 200, 'duplicate product display names!'

out = {
    'branch': branch_map,
    'route': route_map,
    'supplier': supplier_map,
    'product': product_map,
}

backend_path = os.path.join(_HERE, 'backend', 'data', 'display_names.json')
with open(backend_path, 'w') as f:
    json.dump(out, f, indent=2, ensure_ascii=False)
print('wrote', backend_path)

# Frontend gets a typed .ts module (not raw JSON) so this doesn't require enabling
# resolveJsonModule in tsconfig -- one less build-config change for a cosmetic mapping.
ts_path = os.path.join(_HERE, 'frontend', 'src', 'data', 'displayNames.ts')
with open(ts_path, 'w') as f:
    f.write(
        '// GENERATED by gen_display_names.py at the repo root -- do not hand-edit.\n'
        '// Cosmetic display names only; every API call and filter still uses the real values\n'
        "// from the dataset (this file's keys). See forecasting_core.DISPLAY_NAMES for the\n"
        '// backend/export-CSV copy of the same mapping.\n\n'
    )
    f.write('export const DISPLAY_NAMES: Record<string, Record<string, string>> = ')
    f.write(json.dumps(out, indent=2, ensure_ascii=False))
    f.write('\n')
print('wrote', ts_path)

print('OK -- all unique, all counts match')
