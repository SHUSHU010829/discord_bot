require("colors");

module.exports = async (client, interaction) => {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "食物名稱") {
    return interaction.respond([]).catch(() => {});
  }

  const collection = client.collection;
  if (!collection) {
    return interaction.respond([]).catch(() => {});
  }

  try {
    const category = interaction.options.getString("類別");
    const beverageStore = interaction.options.getString("飲料店");

    const filter = {};
    if (category) filter.category = category;
    if (category === "beverage" && beverageStore) {
      filter.beverageStore = beverageStore;
    }

    const docs = await collection
      .find(filter, { projection: { name: 1, beverageStore: 1, category: 1 } })
      .limit(200)
      .toArray();

    const query = (focused.value || "").toLowerCase();
    const seen = new Set();
    const items = [];
    for (const doc of docs) {
      if (!doc.name) continue;
      if (query && !doc.name.toLowerCase().includes(query)) continue;
      // Discord autocomplete name 上限 100 字元；同名分屬不同店家時加店名以區分
      let label = doc.name;
      if (doc.category === "beverage" && doc.beverageStore) {
        label = `${doc.name}（${doc.beverageStore}）`;
      }
      if (label.length > 100) label = label.slice(0, 100);
      // value 必須能還原食物名稱本身（指令依名稱刪除）
      const key = `${label}|${doc.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ name: label, value: doc.name });
      if (items.length >= 25) break;
    }

    await interaction.respond(items);
  } catch (err) {
    console.log(`[ERROR] Food name autocomplete failed:\n${err}`.red);
    interaction.respond([]).catch(() => {});
  }
};
