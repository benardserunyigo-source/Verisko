(function(root){
  var addons = [
    { key: "hdd2tb", label: "Hard drive 2TB", price: 500000 },
    { key: "hdd4tb", label: "Hard drive 4TB", price: 700000 },
    { key: "hdd6tb", label: "Hard drive 6TB", price: 0, currentOnly: true },
    { key: "tv32", label: "32\" LED TV", price: 550000 },
    { key: "tv43", label: "43\" LED TV", price: 850000 },
    { key: "powerpack", label: "Power Pack (UPS + battery)", price: 450000 },
    { key: "lights", label: "Perimeter Light Pack", price: 380000 },
    { key: "router4g", label: "4G Router", price: 250000 },
    { key: "camFixed", label: "Extra camera (outdoor/ceiling)", price: 400000, qty: true },
    { key: "camWide", label: "Extra camera (moving/wide)", price: 500000, qty: true },
    { key: "pole", label: "Metal pole (mounting)", price: 130000, qty: true },
    { key: "welder", label: "Welder site visit", price: 35000 },
    { key: "structural", label: "Structural work bundle", price: 160000 }
  ];
  var zones = [
    { key: "1", label: "Zone 1 — Kampala Central", surcharge: 0 },
    { key: "2", label: "Zone 2 — Greater Kampala / Wakiso", surcharge: 0 },
    { key: "3", label: "Zone 3 — Entebbe / Mukono / Matugga", surcharge: 50000 },
    { key: "beyond", label: "Beyond Zone 3 — regional", surcharge: 300000 }
  ];
  root.VeriskoOffer={addons:addons,zones:zones};
})(typeof window!=="undefined"?window:globalThis);
