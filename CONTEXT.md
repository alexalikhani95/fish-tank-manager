# Fish Tank Manager

Single-user aquarium log. A User owns Tanks; each Tank has a log of WaterChanges and WaterTests.

## Language

**User**:
The person who signs up and logs in. Owns Tanks; nothing is shared between Users. Carries the display preferences (volume unit, temperature unit) — these change how numbers are shown, never what is stored.
_Avoid_: Keeper (the PRD's word for the persona, not the model), Account, Owner

**Tank**:
One aquarium belonging to one User — name, volume, optional brand and model, one photo, its Fish and Plants. The aggregate root: WaterChanges and WaterTests belong to exactly one Tank and go with it when it is deleted.
_Avoid_: Aquarium (as a synonym)

**Volume**:
How much water a Tank holds. Always stored in litres; entered and displayed in the User's preferred unit (litres, US gallons, or UK gallons). The two gallons differ (US 3.785 L, UK 4.546 L) and are never conflated.
_Avoid_: Size (ambiguous with dimensions), Capacity

**Fish**:
One kind of fish in a Tank — a free-text name and a count ("Neon tetra × 6"). Part of the Tank, not a record of its own. Not tied to a species list; a species catalogue is a later feature, and if it comes the name stays.

**Plant**:
One kind of plant in a Tank — a free-text name. Part of the Tank, not a record of its own. No count.

**Photo**:
The single picture of a Tank. Replacing it discards the old one.

**WaterChange**:
One entry in a Tank's log recording that water was replaced — the date (a day, not a time) and the percentage of the Tank's Volume replaced. Optional note. Editable and deletable.
_Avoid_: storing "last water change" on the Tank — it is always the most recent WaterChange by date.

**WaterTest**:
One test session on one date — the keeper tests the water and records several Readings at once. Only the Parameters actually tested carry a Reading; the rest are absent, not zero. Optional note. Editable and deletable.
_Avoid_: Measurement (ambiguous between the session and one value)

**Reading**:
One Parameter's value inside a WaterTest — "nitrate 20 ppm". Stored in the Parameter's canonical unit; temperature always in °C regardless of what the User typed.

**Parameter**:
A thing that can be measured in a WaterTest — ammonia, nitrite, nitrate, pH, GH, KH, temperature, salinity. Each has exactly one unit. The list is fixed in code, not user-editable; adding one is a code change, not a data change.
_Avoid_: Metric, Field

**Trend**:
One Parameter's Readings for one Tank over time, as a chart. Derived from WaterTests, never stored.

**Dashboard**:
The list of the User's Tanks, each showing its Photo, name, Volume, last WaterChange, and last WaterTest.
