-- ============================================================
-- MIGRATION 00014 — LOCATION DOMAIN
-- ============================================================
-- Changes:
--   • Enable pg_trgm for fast city search
--   • Add administrative_regions table (states/provinces/emirates)
--   • Add cities table with trigram search index
--   • Add region_code to customer_addresses + order_address_snapshots
--   • Add allows_free_text_city, allows_free_text_state, city_label
--     to address_country_rules
--   • Seed all 8 supported countries' administrative regions
--   • Seed major cities per region
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── 1. Administrative Regions ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.administrative_regions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code char(2)     NOT NULL,
  code         text        NOT NULL,
  name         text        NOT NULL,
  type         text        NOT NULL CHECK (type IN (
    'state', 'province', 'emirate', 'region', 'county',
    'territory', 'district', 'autonomous_community'
  )),
  is_active    boolean     NOT NULL DEFAULT true,
  sort_order   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_code, code)
);

CREATE INDEX IF NOT EXISTS idx_ar_country_code
  ON public.administrative_regions(country_code);
CREATE INDEX IF NOT EXISTS idx_ar_country_active
  ON public.administrative_regions(country_code, is_active);

-- ── 2. Cities ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cities (
  id                         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code               char(2) NOT NULL,
  administrative_region_code text    NOT NULL,
  name                       text    NOT NULL,
  normalized_name            text    NOT NULL GENERATED ALWAYS AS (lower(trim(name))) STORED,
  is_active                  boolean NOT NULL DEFAULT true,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_code, administrative_region_code, normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_cities_country_region
  ON public.cities(country_code, administrative_region_code);
CREATE INDEX IF NOT EXISTS idx_cities_trgm
  ON public.cities USING gin(normalized_name gin_trgm_ops);

-- ── 3. Add region_code to address tables ──────────────────────────────────────

ALTER TABLE public.customer_addresses
  ADD COLUMN IF NOT EXISTS region_code text;

ALTER TABLE public.order_address_snapshots
  ADD COLUMN IF NOT EXISTS region_code text;

-- ── 4. Extend address_country_rules ──────────────────────────────────────────

ALTER TABLE public.address_country_rules
  ADD COLUMN IF NOT EXISTS allows_free_text_city  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allows_free_text_state boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS city_label             text    NOT NULL DEFAULT 'City';

UPDATE public.address_country_rules SET
  allows_free_text_city  = false,
  allows_free_text_state = false,
  city_label             = 'City'
WHERE true;

-- For countries with fewer cities in DB, allow free text initially
UPDATE public.address_country_rules SET allows_free_text_city = true
WHERE country_id IN ('uk', 'fr', 'it', 'es', 'de');

-- ── 5. Seed administrative regions ────────────────────────────────────────────

INSERT INTO public.administrative_regions (country_code, code, name, type, sort_order)
VALUES
-- ── United States (50 states + DC) ────────────────────────────────────────
('US','AL','Alabama','state',1),
('US','AK','Alaska','state',2),
('US','AZ','Arizona','state',3),
('US','AR','Arkansas','state',4),
('US','CA','California','state',5),
('US','CO','Colorado','state',6),
('US','CT','Connecticut','state',7),
('US','DE','Delaware','state',8),
('US','FL','Florida','state',9),
('US','GA','Georgia','state',10),
('US','HI','Hawaii','state',11),
('US','ID','Idaho','state',12),
('US','IL','Illinois','state',13),
('US','IN','Indiana','state',14),
('US','IA','Iowa','state',15),
('US','KS','Kansas','state',16),
('US','KY','Kentucky','state',17),
('US','LA','Louisiana','state',18),
('US','ME','Maine','state',19),
('US','MD','Maryland','state',20),
('US','MA','Massachusetts','state',21),
('US','MI','Michigan','state',22),
('US','MN','Minnesota','state',23),
('US','MS','Mississippi','state',24),
('US','MO','Missouri','state',25),
('US','MT','Montana','state',26),
('US','NE','Nebraska','state',27),
('US','NV','Nevada','state',28),
('US','NH','New Hampshire','state',29),
('US','NJ','New Jersey','state',30),
('US','NM','New Mexico','state',31),
('US','NY','New York','state',32),
('US','NC','North Carolina','state',33),
('US','ND','North Dakota','state',34),
('US','OH','Ohio','state',35),
('US','OK','Oklahoma','state',36),
('US','OR','Oregon','state',37),
('US','PA','Pennsylvania','state',38),
('US','RI','Rhode Island','state',39),
('US','SC','South Carolina','state',40),
('US','SD','South Dakota','state',41),
('US','TN','Tennessee','state',42),
('US','TX','Texas','state',43),
('US','UT','Utah','state',44),
('US','VT','Vermont','state',45),
('US','VA','Virginia','state',46),
('US','WA','Washington','state',47),
('US','WV','West Virginia','state',48),
('US','WI','Wisconsin','state',49),
('US','WY','Wyoming','state',50),
('US','DC','District of Columbia','district',51),
-- ── India (28 states + 8 UTs) ─────────────────────────────────────────────
('IN','AP','Andhra Pradesh','state',1),
('IN','AR','Arunachal Pradesh','state',2),
('IN','AS','Assam','state',3),
('IN','BR','Bihar','state',4),
('IN','CG','Chhattisgarh','state',5),
('IN','GA','Goa','state',6),
('IN','GJ','Gujarat','state',7),
('IN','HR','Haryana','state',8),
('IN','HP','Himachal Pradesh','state',9),
('IN','JH','Jharkhand','state',10),
('IN','KA','Karnataka','state',11),
('IN','KL','Kerala','state',12),
('IN','MP','Madhya Pradesh','state',13),
('IN','MH','Maharashtra','state',14),
('IN','MN','Manipur','state',15),
('IN','ML','Meghalaya','state',16),
('IN','MZ','Mizoram','state',17),
('IN','NL','Nagaland','state',18),
('IN','OR','Odisha','state',19),
('IN','PB','Punjab','state',20),
('IN','RJ','Rajasthan','state',21),
('IN','SK','Sikkim','state',22),
('IN','TN','Tamil Nadu','state',23),
('IN','TG','Telangana','state',24),
('IN','TR','Tripura','state',25),
('IN','UP','Uttar Pradesh','state',26),
('IN','UK','Uttarakhand','state',27),
('IN','WB','West Bengal','state',28),
('IN','AN','Andaman and Nicobar Islands','territory',29),
('IN','CH','Chandigarh','territory',30),
('IN','DH','Dadra and Nagar Haveli and Daman and Diu','territory',31),
('IN','DL','Delhi','territory',32),
('IN','JK','Jammu and Kashmir','territory',33),
('IN','LA','Ladakh','territory',34),
('IN','LD','Lakshadweep','territory',35),
('IN','PY','Puducherry','territory',36),
-- ── Germany (16 Bundesländer) ─────────────────────────────────────────────
('DE','BB','Brandenburg','state',1),
('DE','BE','Berlin','state',2),
('DE','BW','Baden-Württemberg','state',3),
('DE','BY','Bavaria','state',4),
('DE','HB','Bremen','state',5),
('DE','HE','Hesse','state',6),
('DE','HH','Hamburg','state',7),
('DE','MV','Mecklenburg-Vorpommern','state',8),
('DE','NI','Lower Saxony','state',9),
('DE','NW','North Rhine-Westphalia','state',10),
('DE','RP','Rhineland-Palatinate','state',11),
('DE','SH','Schleswig-Holstein','state',12),
('DE','SL','Saarland','state',13),
('DE','SN','Saxony','state',14),
('DE','ST','Saxony-Anhalt','state',15),
('DE','TH','Thuringia','state',16),
-- ── UAE (7 Emirates) ──────────────────────────────────────────────────────
('AE','AZ','Abu Dhabi','emirate',1),
('AE','AJ','Ajman','emirate',2),
('AE','DU','Dubai','emirate',3),
('AE','FU','Fujairah','emirate',4),
('AE','RA','Ras Al Khaimah','emirate',5),
('AE','SH','Sharjah','emirate',6),
('AE','UM','Umm Al Quwain','emirate',7),
-- ── United Kingdom ────────────────────────────────────────────────────────
('GB','ENG','England','region',1),
('GB','SCT','Scotland','region',2),
('GB','WLS','Wales','region',3),
('GB','NIR','Northern Ireland','region',4),
-- ── France (13 metropolitan regions) ─────────────────────────────────────
('FR','ARA','Auvergne-Rhône-Alpes','region',1),
('FR','BFC','Bourgogne-Franche-Comté','region',2),
('FR','BRE','Bretagne','region',3),
('FR','CVL','Centre-Val de Loire','region',4),
('FR','COR','Corse','region',5),
('FR','GES','Grand Est','region',6),
('FR','HDF','Hauts-de-France','region',7),
('FR','IDF','Île-de-France','region',8),
('FR','NOR','Normandie','region',9),
('FR','NAQ','Nouvelle-Aquitaine','region',10),
('FR','OCC','Occitanie','region',11),
('FR','PDL','Pays de la Loire','region',12),
('FR','PAC','Provence-Alpes-Côte d''Azur','region',13),
-- ── Italy (20 regions) ───────────────────────────────────────────────────
('IT','ABR','Abruzzo','region',1),
('IT','BAS','Basilicata','region',2),
('IT','CAL','Calabria','region',3),
('IT','CAM','Campania','region',4),
('IT','EMR','Emilia-Romagna','region',5),
('IT','FVG','Friuli-Venezia Giulia','region',6),
('IT','LAZ','Lazio','region',7),
('IT','LIG','Liguria','region',8),
('IT','LOM','Lombardia','region',9),
('IT','MAR','Marche','region',10),
('IT','MOL','Molise','region',11),
('IT','PIE','Piemonte','region',12),
('IT','PUG','Puglia','region',13),
('IT','SAR','Sardegna','region',14),
('IT','SIC','Sicilia','region',15),
('IT','TAA','Trentino-Alto Adige','region',16),
('IT','TOS','Toscana','region',17),
('IT','UMB','Umbria','region',18),
('IT','VDA','Valle d''Aosta','region',19),
('IT','VEN','Veneto','region',20),
-- ── Spain (17 autonomous communities) ────────────────────────────────────
('ES','AND','Andalucía','autonomous_community',1),
('ES','ARA','Aragón','autonomous_community',2),
('ES','AST','Asturias','autonomous_community',3),
('ES','BAL','Balearic Islands','autonomous_community',4),
('ES','CAN','Canary Islands','autonomous_community',5),
('ES','CBR','Cantabria','autonomous_community',6),
('ES','CYL','Castilla y León','autonomous_community',7),
('ES','CLM','Castilla-La Mancha','autonomous_community',8),
('ES','CAT','Catalonia','autonomous_community',9),
('ES','EXT','Extremadura','autonomous_community',10),
('ES','GAL','Galicia','autonomous_community',11),
('ES','LOR','La Rioja','autonomous_community',12),
('ES','MAD','Community of Madrid','autonomous_community',13),
('ES','MUR','Region of Murcia','autonomous_community',14),
('ES','NAV','Navarre','autonomous_community',15),
('ES','EUS','Basque Country','autonomous_community',16),
('ES','VAL','Valencian Community','autonomous_community',17)
ON CONFLICT (country_code, code) DO NOTHING;

-- ── 6. Seed cities ────────────────────────────────────────────────────────────

INSERT INTO public.cities (country_code, administrative_region_code, name)
VALUES
-- ── United States — California ────────────────────────────────────────────
('US','CA','Los Angeles'),
('US','CA','San Francisco'),
('US','CA','San Diego'),
('US','CA','San Jose'),
('US','CA','Sacramento'),
('US','CA','Fresno'),
('US','CA','Oakland'),
('US','CA','Long Beach'),
('US','CA','Anaheim'),
('US','CA','Bakersfield'),
('US','CA','Santa Ana'),
('US','CA','Riverside'),
('US','CA','Stockton'),
('US','CA','Irvine'),
('US','CA','Santa Clara'),
-- ── United States — New York ──────────────────────────────────────────────
('US','NY','New York City'),
('US','NY','Buffalo'),
('US','NY','Rochester'),
('US','NY','Yonkers'),
('US','NY','Syracuse'),
('US','NY','Albany'),
('US','NY','New Rochelle'),
('US','NY','Mount Vernon'),
('US','NY','Schenectady'),
-- ── United States — Texas ─────────────────────────────────────────────────
('US','TX','Houston'),
('US','TX','San Antonio'),
('US','TX','Dallas'),
('US','TX','Austin'),
('US','TX','Fort Worth'),
('US','TX','El Paso'),
('US','TX','Arlington'),
('US','TX','Corpus Christi'),
('US','TX','Plano'),
('US','TX','Lubbock'),
-- ── United States — Florida ───────────────────────────────────────────────
('US','FL','Jacksonville'),
('US','FL','Miami'),
('US','FL','Tampa'),
('US','FL','Orlando'),
('US','FL','St. Petersburg'),
('US','FL','Hialeah'),
('US','FL','Tallahassee'),
('US','FL','Fort Lauderdale'),
-- ── United States — Illinois ──────────────────────────────────────────────
('US','IL','Chicago'),
('US','IL','Aurora'),
('US','IL','Joliet'),
('US','IL','Naperville'),
('US','IL','Rockford'),
('US','IL','Springfield'),
-- ── United States — Pennsylvania ──────────────────────────────────────────
('US','PA','Philadelphia'),
('US','PA','Pittsburgh'),
('US','PA','Allentown'),
('US','PA','Erie'),
('US','PA','Reading'),
-- ── United States — Ohio ──────────────────────────────────────────────────
('US','OH','Columbus'),
('US','OH','Cleveland'),
('US','OH','Cincinnati'),
('US','OH','Toledo'),
('US','OH','Akron'),
-- ── United States — Georgia ───────────────────────────────────────────────
('US','GA','Atlanta'),
('US','GA','Augusta'),
('US','GA','Columbus'),
('US','GA','Macon'),
('US','GA','Savannah'),
-- ── United States — North Carolina ───────────────────────────────────────
('US','NC','Charlotte'),
('US','NC','Raleigh'),
('US','NC','Greensboro'),
('US','NC','Durham'),
('US','NC','Winston-Salem'),
-- ── United States — Michigan ──────────────────────────────────────────────
('US','MI','Detroit'),
('US','MI','Grand Rapids'),
('US','MI','Warren'),
('US','MI','Sterling Heights'),
('US','MI','Ann Arbor'),
-- ── United States — Washington ────────────────────────────────────────────
('US','WA','Seattle'),
('US','WA','Spokane'),
('US','WA','Tacoma'),
('US','WA','Vancouver'),
('US','WA','Bellevue'),
-- ── United States — Arizona ───────────────────────────────────────────────
('US','AZ','Phoenix'),
('US','AZ','Tucson'),
('US','AZ','Mesa'),
('US','AZ','Chandler'),
('US','AZ','Scottsdale'),
-- ── United States — Colorado ──────────────────────────────────────────────
('US','CO','Denver'),
('US','CO','Colorado Springs'),
('US','CO','Aurora'),
('US','CO','Fort Collins'),
('US','CO','Boulder'),
-- ── United States — Virginia ──────────────────────────────────────────────
('US','VA','Virginia Beach'),
('US','VA','Norfolk'),
('US','VA','Chesapeake'),
('US','VA','Richmond'),
('US','VA','Arlington'),
-- ── United States — Massachusetts ────────────────────────────────────────
('US','MA','Boston'),
('US','MA','Worcester'),
('US','MA','Springfield'),
('US','MA','Lowell'),
('US','MA','Cambridge'),
-- ── United States — Nevada ────────────────────────────────────────────────
('US','NV','Las Vegas'),
('US','NV','Henderson'),
('US','NV','Reno'),
('US','NV','North Las Vegas'),
-- ── United States — Oregon ────────────────────────────────────────────────
('US','OR','Portland'),
('US','OR','Salem'),
('US','OR','Eugene'),
('US','OR','Gresham'),
-- ── United States — DC ────────────────────────────────────────────────────
('US','DC','Washington'),
-- ── India — Maharashtra ───────────────────────────────────────────────────
('IN','MH','Mumbai'),
('IN','MH','Pune'),
('IN','MH','Nagpur'),
('IN','MH','Thane'),
('IN','MH','Nashik'),
('IN','MH','Aurangabad'),
('IN','MH','Solapur'),
('IN','MH','Kolhapur'),
('IN','MH','Amravati'),
('IN','MH','Navi Mumbai'),
-- ── India — Delhi ─────────────────────────────────────────────────────────
('IN','DL','New Delhi'),
('IN','DL','Delhi'),
('IN','DL','Dwarka'),
('IN','DL','Rohini'),
('IN','DL','Janakpuri'),
-- ── India — Karnataka ─────────────────────────────────────────────────────
('IN','KA','Bengaluru'),
('IN','KA','Mysuru'),
('IN','KA','Hubballi'),
('IN','KA','Mangaluru'),
('IN','KA','Belagavi'),
('IN','KA','Kalaburagi'),
('IN','KA','Davanagere'),
-- ── India — Tamil Nadu ────────────────────────────────────────────────────
('IN','TN','Chennai'),
('IN','TN','Coimbatore'),
('IN','TN','Madurai'),
('IN','TN','Tiruchirappalli'),
('IN','TN','Salem'),
('IN','TN','Tirunelveli'),
('IN','TN','Erode'),
('IN','TN','Tiruppur'),
-- ── India — Telangana ─────────────────────────────────────────────────────
('IN','TG','Hyderabad'),
('IN','TG','Warangal'),
('IN','TG','Nizamabad'),
('IN','TG','Karimnagar'),
-- ── India — Gujarat ───────────────────────────────────────────────────────
('IN','GJ','Ahmedabad'),
('IN','GJ','Surat'),
('IN','GJ','Vadodara'),
('IN','GJ','Rajkot'),
('IN','GJ','Bhavnagar'),
('IN','GJ','Jamnagar'),
-- ── India — Rajasthan ─────────────────────────────────────────────────────
('IN','RJ','Jaipur'),
('IN','RJ','Jodhpur'),
('IN','RJ','Kota'),
('IN','RJ','Bikaner'),
('IN','RJ','Ajmer'),
('IN','RJ','Udaipur'),
-- ── India — Uttar Pradesh ─────────────────────────────────────────────────
('IN','UP','Lucknow'),
('IN','UP','Kanpur'),
('IN','UP','Ghaziabad'),
('IN','UP','Agra'),
('IN','UP','Varanasi'),
('IN','UP','Meerut'),
('IN','UP','Allahabad'),
('IN','UP','Noida'),
-- ── India — West Bengal ───────────────────────────────────────────────────
('IN','WB','Kolkata'),
('IN','WB','Howrah'),
('IN','WB','Durgapur'),
('IN','WB','Asansol'),
('IN','WB','Siliguri'),
-- ── India — Punjab ────────────────────────────────────────────────────────
('IN','PB','Ludhiana'),
('IN','PB','Amritsar'),
('IN','PB','Jalandhar'),
('IN','PB','Patiala'),
-- ── India — Andhra Pradesh ────────────────────────────────────────────────
('IN','AP','Visakhapatnam'),
('IN','AP','Vijayawada'),
('IN','AP','Guntur'),
('IN','AP','Tirupati'),
-- ── India — Madhya Pradesh ────────────────────────────────────────────────
('IN','MP','Bhopal'),
('IN','MP','Indore'),
('IN','MP','Jabalpur'),
('IN','MP','Gwalior'),
-- ── India — Haryana ───────────────────────────────────────────────────────
('IN','HR','Faridabad'),
('IN','HR','Gurgaon'),
('IN','HR','Panipat'),
('IN','HR','Ambala'),
-- ── India — Kerala ────────────────────────────────────────────────────────
('IN','KL','Thiruvananthapuram'),
('IN','KL','Kochi'),
('IN','KL','Kozhikode'),
('IN','KL','Thrissur'),
-- ── Germany ───────────────────────────────────────────────────────────────
('DE','BY','Munich'),
('DE','BY','Nuremberg'),
('DE','BY','Augsburg'),
('DE','NW','Cologne'),
('DE','NW','Düsseldorf'),
('DE','NW','Dortmund'),
('DE','NW','Essen'),
('DE','NW','Duisburg'),
('DE','BE','Berlin'),
('DE','HH','Hamburg'),
('DE','HE','Frankfurt'),
('DE','HE','Wiesbaden'),
('DE','BW','Stuttgart'),
('DE','BW','Karlsruhe'),
('DE','BW','Freiburg'),
('DE','SN','Leipzig'),
('DE','SN','Dresden'),
('DE','NI','Hanover'),
('DE','NI','Braunschweig'),
('DE','BB','Potsdam'),
('DE','TH','Erfurt'),
('DE','TH','Jena'),
('DE','SL','Saarbrücken'),
('DE','SH','Kiel'),
('DE','SH','Lübeck'),
('DE','HB','Bremen'),
('DE','MV','Rostock'),
('DE','ST','Magdeburg'),
('DE','RP','Mainz'),
('DE','RP','Trier'),
-- ── UAE ───────────────────────────────────────────────────────────────────
('AE','DU','Dubai'),
('AE','DU','Deira'),
('AE','DU','Bur Dubai'),
('AE','DU','Jumeirah'),
('AE','DU','Business Bay'),
('AE','DU','Marina'),
('AE','AZ','Abu Dhabi'),
('AE','AZ','Al Ain'),
('AE','AZ','Khalifa City'),
('AE','AZ','Mussafah'),
('AE','SH','Sharjah'),
('AE','SH','Al Nahda'),
('AE','AJ','Ajman'),
('AE','RA','Ras Al Khaimah'),
('AE','FU','Fujairah'),
('AE','UM','Umm Al Quwain'),
-- ── United Kingdom ────────────────────────────────────────────────────────
('GB','ENG','London'),
('GB','ENG','Manchester'),
('GB','ENG','Birmingham'),
('GB','ENG','Leeds'),
('GB','ENG','Sheffield'),
('GB','ENG','Liverpool'),
('GB','ENG','Bristol'),
('GB','ENG','Newcastle'),
('GB','ENG','Leicester'),
('GB','ENG','Coventry'),
('GB','ENG','Bradford'),
('GB','ENG','Nottingham'),
('GB','ENG','Oxford'),
('GB','ENG','Cambridge'),
('GB','SCT','Edinburgh'),
('GB','SCT','Glasgow'),
('GB','SCT','Aberdeen'),
('GB','WLS','Cardiff'),
('GB','WLS','Swansea'),
('GB','NIR','Belfast'),
-- ── France ────────────────────────────────────────────────────────────────
('FR','IDF','Paris'),
('FR','IDF','Versailles'),
('FR','ARA','Lyon'),
('FR','ARA','Grenoble'),
('FR','PAC','Marseille'),
('FR','PAC','Nice'),
('FR','PAC','Toulon'),
('FR','OCC','Toulouse'),
('FR','OCC','Montpellier'),
('FR','NAQ','Bordeaux'),
('FR','HDF','Lille'),
('FR','BRE','Nantes'),
('FR','NOR','Rouen'),
('FR','GES','Strasbourg'),
-- ── Italy ─────────────────────────────────────────────────────────────────
('IT','LOM','Milan'),
('IT','LOM','Bergamo'),
('IT','LOM','Brescia'),
('IT','LAZ','Rome'),
('IT','CAM','Naples'),
('IT','SIC','Palermo'),
('IT','SIC','Catania'),
('IT','VEN','Venice'),
('IT','VEN','Verona'),
('IT','EMR','Bologna'),
('IT','EMR','Parma'),
('IT','TOS','Florence'),
('IT','PIE','Turin'),
('IT','LIG','Genoa'),
-- ── Spain ─────────────────────────────────────────────────────────────────
('ES','MAD','Madrid'),
('ES','CAT','Barcelona'),
('ES','AND','Seville'),
('ES','AND','Málaga'),
('ES','VAL','Valencia'),
('ES','EUS','Bilbao'),
('ES','GAL','Santiago de Compostela'),
('ES','MUR','Murcia'),
('ES','ARA','Zaragoza'),
('ES','CYL','Valladolid'),
('ES','CYL','Salamanca')
ON CONFLICT (country_code, administrative_region_code, normalized_name) DO NOTHING;
