require("colors");

module.exports = async (client, interaction) => {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "飲料店") {
    return interaction.respond([]).catch(() => {});
  }

  const collection = client.collection;
  if (!collection) {
    return interaction.respond([]).catch(() => {});
  }

  try {
    const stores = await collection.distinct("beverageStore", {
      category: "beverage",
    });
    const query = (focused.value || "").toLowerCase();
    const filtered = stores
      .filter((s) => typeof s === "string" && s.length > 0)
      .filter((s) => !query || s.toLowerCase().includes(query))
      .sort()
      .slice(0, 25)
      .map((s) => ({ name: s, value: s }));
    await interaction.respond(filtered);
  } catch (err) {
    console.log(
      `[ERROR] Beverage store autocomplete failed:\n${err}`.red
    );
    interaction.respond([]).catch(() => {});
  }
};
