// Ingredient catalog for the plate builder (Hebrew). A meal = protein + whole carb + vegetables/fat (+ flavor),
// matching the user's plate formula. Every item is rule-friendly (no refined sugar / white flour / deep-fry).
//   slots: 'b' = breakfast only, 'm' = lunch & dinner only, 'bm' = all three meals
//   grp:   a finer "family" — when something is missing, swaps from the same family are suggested first
(function (root) {
  'use strict';

  const PARTS = [
    { id: 'protein', name: 'חלבון' },
    { id: 'carb', name: 'פחמימה מלאה' },
    { id: 'veg', name: 'ירקות' },
    { id: 'fat', name: 'שומן / רוטב' },
    { id: 'flavor', name: 'טעם' }
  ];

  const it = (id, part, grp, slots, name) => ({ id, part, grp, slots, name });

  const ITEMS = [
    // ---------- protein ----------
    it('egg_fried', 'protein', 'egg', 'bm', 'ביצי עין'),
    it('egg_scr', 'protein', 'egg', 'bm', 'ביצים מקושקשות'),
    it('egg_boiled', 'protein', 'egg', 'bm', 'ביצים קשות'),
    it('egg_soft', 'protein', 'egg', 'bm', 'ביצים רכות'),
    it('egg_omelet', 'protein', 'egg', 'bm', 'חביתה'),
    it('egg_shak', 'protein', 'egg', 'bm', 'שקשוקה'),
    it('egg_veg', 'protein', 'egg', 'bm', 'ביצה במחבת עם ירקות'),
    it('cottage', 'protein', 'dairy', 'bm', 'קוטג׳'),
    it('yogurt', 'protein', 'dairy', 'b', 'יוגורט יווני טבעי'),
    it('labane', 'protein', 'dairy', 'b', 'גבינה לבנה / לבנה'),
    it('halloumi', 'protein', 'cheese', 'bm', 'חלומי'),
    it('feta', 'protein', 'cheese', 'bm', 'פטה / גבינה בולגרית'),
    it('yellowcheese', 'protein', 'cheese', 'b', 'גבינה צהובה'),
    it('mozzarella', 'protein', 'cheese', 'm', 'מוצרלה טרייה'),
    it('tuna', 'protein', 'fish', 'bm', 'טונה משומרת'),
    it('smoked_fish', 'protein', 'fish', 'b', 'סלמון / פורל מעושן'),
    it('salmon', 'protein', 'fish', 'm', 'סלמון (אפוי / צרוב)'),
    it('bream', 'protein', 'fish', 'm', 'דניס / לברק'),
    it('whitefish', 'protein', 'fish', 'm', 'בקלה / טילאפיה'),
    it('fish_skewer', 'protein', 'fish', 'm', 'שיפודי דג'),
    it('chicken_breast', 'protein', 'poultry', 'm', 'חזה עוף'),
    it('pargiot', 'protein', 'poultry', 'm', 'פרגיות'),
    it('drumsticks', 'protein', 'poultry', 'm', 'כרעי עוף'),
    it('shawarma', 'protein', 'poultry', 'm', 'שווארמת עוף (מושחמת במחבת)'),
    it('turkey', 'protein', 'poultry', 'm', 'הודו (חזה / שיפודים / טחון)'),
    it('chicken_strips', 'protein', 'poultry', 'm', 'רצועות עוף מוקפצות'),
    it('ground_beef', 'protein', 'redmeat', 'bm', 'בקר טחון (קציצות / קבב / המבורגר)'),
    it('steak', 'protein', 'redmeat', 'm', 'סטייק / אנטריקוט / סינטה'),
    it('roast_beef', 'protein', 'redmeat', 'm', 'צלי / כתף בקר'),
    it('hummus', 'protein', 'legume', 'bm', 'חומוס'),
    it('fava', 'protein', 'legume', 'b', 'פול'),
    it('lentils_p', 'protein', 'legume', 'bm', 'עדשים'),
    it('beans_p', 'protein', 'legume', 'bm', 'שעועית'),
    it('chickpeas', 'protein', 'legume', 'm', 'גרגירי חומוס'),
    it('tofu', 'protein', 'plant', 'bm', 'טופו (אפוי / מקושקש)'),
    it('seitan', 'protein', 'plant', 'm', 'סייטן'),
    it('leftover_meat', 'protein', 'leftover', 'bm', 'שאריות בשר / עוף מאתמול'),

    // ---------- whole carb ----------
    it('sourdough', 'carb', 'bread', 'bm', 'לחם מחמצת'),
    it('whole_bread', 'carb', 'bread', 'bm', 'לחם מלא / כוסמין / שיפון'),
    it('whole_pita', 'carb', 'bread', 'bm', 'פיתה מלאה'),
    it('rice', 'carb', 'grain', 'bm', 'אורז (לבן / מלא)'),
    it('quinoa', 'carb', 'grain', 'bm', 'קינואה'),
    it('buckwheat', 'carb', 'grain', 'm', 'כוסמת'),
    it('potato', 'carb', 'tuber', 'bm', 'תפוח אדמה (אפוי / מבושל / פירה)'),
    it('sweet_potato', 'carb', 'tuber', 'bm', 'בטטה'),
    it('oats', 'carb', 'oats', 'b', 'שיבולת שועל'),
    it('whole_pasta', 'carb', 'pasta', 'm', 'פסטה מלאה'),
    it('legume_pasta', 'carb', 'pasta', 'm', 'פסטה מקטניות (עדשים / חומוס)'),
    it('lentils_c', 'carb', 'legume', 'm', 'עדשים'),
    it('beans_c', 'carb', 'legume', 'm', 'שעועית'),

    // ---------- vegetables ----------
    it('cucumber', 'veg', 'salad', 'bm', 'מלפפון'),
    it('tomato', 'veg', 'salad', 'bm', 'עגבנייה'),
    it('lettuce', 'veg', 'salad', 'bm', 'חסה / עלים ירוקים'),
    it('pepper', 'veg', 'salad', 'bm', 'פלפל'),
    it('radish', 'veg', 'salad', 'b', 'צנונית'),
    it('herbs', 'veg', 'salad', 'bm', 'פטרוזיליה / נענע / כוסברה'),
    it('israeli_salad', 'veg', 'salad', 'm', 'סלט ישראלי קצוץ'),
    it('cabbage', 'veg', 'salad', 'm', 'כרוב / סלט כרוב וגזר'),
    it('roasted_veg', 'veg', 'cooked', 'm', 'ירקות צלויים (קישואים, חצילים, פלפלים, גזר)'),
    it('steamed_broccoli', 'veg', 'cooked', 'm', 'ברוקולי / כרובית מאודים'),
    it('green_beans', 'veg', 'cooked', 'm', 'שעועית ירוקה'),
    it('stir_veg', 'veg', 'cooked', 'm', 'ירקות מוקפצים'),
    it('spinach', 'veg', 'cooked', 'bm', 'תרד'),
    it('mushrooms', 'veg', 'cooked', 'bm', 'פטריות'),
    it('asparagus', 'veg', 'cooked', 'm', 'אספרגוס'),
    it('pickles', 'veg', 'pickled', 'bm', 'מלפפון חמוץ / חמוצים'),

    // ---------- fat / sauce ----------
    it('tahini', 'fat', 'oil', 'bm', 'טחינה'),
    it('olive_oil', 'fat', 'oil', 'bm', 'שמן זית'),
    it('avocado', 'fat', 'oil', 'bm', 'אבוקדו'),
    it('nuts', 'fat', 'nuts', 'bm', 'אגוזים / שקדים טבעיים'),
    it('seeds', 'fat', 'nuts', 'b', 'זרעי צ׳יה / פשתן / שומשום'),
    it('peanut_butter', 'fat', 'nuts', 'b', 'חמאת בוטנים (בלי סוכר)'),
    it('olives', 'fat', 'olive', 'bm', 'זיתים'),
    it('yogurt_garlic', 'fat', 'sauce', 'm', 'יוגורט + שום + לימון'),
    it('tomato_paste', 'fat', 'sauce', 'bm', 'רסק / פסטטה עגבניות'),
    it('pesto', 'fat', 'sauce', 'm', 'פסטו'),

    // ---------- flavor ----------
    it('zaatar', 'flavor', 'spice', 'bm', 'זעתר'),
    it('paprika_cumin', 'flavor', 'spice', 'bm', 'פפריקה / כמון'),
    it('salt_pepper', 'flavor', 'spice', 'bm', 'מלח ופלפל שחור'),
    it('lemon', 'flavor', 'citrus', 'bm', 'לימון'),
    it('garlic', 'flavor', 'citrus', 'bm', 'שום'),
    it('chili', 'flavor', 'heat', 'bm', 'צ׳ילי / חריף (בלי סוכר)'),
    it('harissa', 'flavor', 'heat', 'bm', 'חריסה'),
    it('mustard', 'flavor', 'heat', 'bm', 'חרדל (בלי סוכר)'),
    it('soy_sesame', 'flavor', 'heat', 'm', 'סויה / שמן שומשום')
  ];

  root.Ingredients = { PARTS, ITEMS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
