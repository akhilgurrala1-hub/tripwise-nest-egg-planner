"""Build src/lib/airports-data.ts from OurAirports' airports.csv (public domain).

Usage: curl -sLo /tmp/airports.csv https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv
       python3 -I scripts/airports.py /tmp/airports.csv src/lib/airports-data.ts
"""
import csv, json, re, sys
src, out = sys.argv[1], sys.argv[2]
rows = []
with open(src, newline='', encoding='utf-8') as f:
    for r in csv.DictReader(f):
        if r['type'] not in ('large_airport', 'medium_airport'): continue
        if r['scheduled_service'] != 'yes': continue
        code = (r['iata_code'] or '').strip()
        if not re.fullmatch(r'[A-Z]{3}', code): continue
        try:
            lat = round(float(r['latitude_deg']), 3); lon = round(float(r['longitude_deg']), 3)
        except ValueError:
            continue
        name = re.sub(r'\s+', ' ', r['name']).replace('\u2013', '-').replace('\u2014', '-').strip()[:70]
        city = re.sub(r'\s+', ' ', r['municipality'] or '').replace('\u2013', '-').replace('\u2014', '-').strip()[:50]
        country = (r['iso_country'] or '').strip()[:2]
        size = 'L' if r['type'] == 'large_airport' else 'M'
        rows.append([code, lat, lon, size, city, country, name])
rows.sort(key=lambda x: x[0])
seen=set(); uniq=[]
for r in rows:
    if r[0] in seen: continue
    seen.add(r[0]); uniq.append(r)
header = '''// Generated from OurAirports (https://ourairports.com/data/, public domain) by
// keeping large and medium airports with scheduled service and an IATA code.
// Columns: [IATA, lat, lon, size (L = large, M = medium), city, country, name]
// Regenerate with scripts/airports.py; don't edit by hand.
export type AirportRow = [string, number, number, "L" | "M", string, string, string];
export const AIRPORT_ROWS: AirportRow[] = '''
with open(out, 'w', encoding='utf-8') as f:
    f.write(header + json.dumps(uniq, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(len(uniq), sum(1 for r in uniq if r[3]=='L'))
