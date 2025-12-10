require("colors");

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const buttonPaginator = require("../../utils/buttonPagination");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("逼逼機器人工作介紹！📚"),

  run: async (client, interaction) => {
    try {
      const pages = [];
      const baseColor = 0x00ae86;

      // ========== 第 1 頁：首頁/概覽 ==========
      const homePage = new EmbedBuilder()
        .setTitle("📚 逼逼機器人使用手冊")
        .setDescription(
          "歡迎使用逼逼機器人！\n使用下方按鈕翻頁查看各功能詳細說明。\n\n" +
            "**功能目錄：**\n" +
            "📖 第 1 頁 - 📚 首頁（當前頁）\n" +
            "📖 第 2 頁 - 🍽️ 食物系統（基本）\n" +
            "📖 第 3 頁 - 🍽️ 食物系統（進階）\n" +
            "📖 第 4 頁 - 🥤 飲料管理系統\n" +
            "📖 第 5 頁 - 🎫 票務系統\n" +
            "📖 第 6 頁 - 🎮 其他功能"
        )
        .setColor(baseColor)
        .addFields(
          {
            name: "💡 使用提示",
            value:
              "• 點擊 ⬅️ 返回上一頁\n" +
              "• 點擊 🏠 返回首頁\n" +
              "• 點擊 ➡️ 前往下一頁",
            inline: false,
          },
          {
            name: "🔗 快速連結",
            value:
              "需要幫助？使用 `/help` 隨時查看本手冊\n" +
              "遇到問題？使用 `/create-ticket` 建立支援票務",
            inline: false,
          }
        )
        .setFooter({ text: "第 1 頁 / 6 頁" })
        .setTimestamp();

      pages.push(homePage);

      // ========== 第 2 頁：食物系統 - 基本 ==========
      const foodBasicPage = new EmbedBuilder()
        .setTitle("🍽️ 食物系統 - 基本指令")
        .setDescription("讓逼逼機器人幫你決定吃什麼！支援早餐、午餐、晚餐、宵夜、飲料五大分類。")
        .setColor(baseColor)
        .addFields(
          {
            name: "🎰 /吃什麼",
            value:
              "**功能：** 隨機抽選食物\n" +
              "**參數：**\n" +
              "• `類別`（可選）- 指定分類：早餐/午餐/晚餐/宵夜/飲料\n" +
              "• `飲料店`（可選）- 指定飲料店名稱\n\n" +
              "**範例：**\n" +
              "• `/吃什麼` - 隨機所有食物\n" +
              "• `/吃什麼 類別:早餐` - 隨機早餐\n" +
              "• `/吃什麼 類別:飲料` - 隨機飲料",
            inline: false,
          },
          {
            name: "🥤 /喝什麼",
            value:
              "**功能：** 飲料專用選擇器\n" +
              "**參數：**\n" +
              "• `飲料店`（可選）- 指定飲料店名稱\n\n" +
              "**範例：**\n" +
              "• `/喝什麼` - 隨機所有飲料店的飲品\n" +
              "• `/喝什麼 飲料店:可不可紅茶` - 隨機可不可的飲品",
            inline: false,
          },
          {
            name: "📚 /有什麼能吃",
            value:
              "**功能：** 查看食物清單\n" +
              "**參數：**\n" +
              "• `類別`（可選）- 篩選特定分類\n\n" +
              "**範例：**\n" +
              "• `/有什麼能吃` - 查看所有食物（分類顯示）\n" +
              "• `/有什麼能吃 類別:飲料` - 只看飲料（按店家分組）",
            inline: false,
          },
          {
            name: "🏆 /食物排行",
            value:
              "**功能：** 查看最受歡迎的食物排行榜\n" +
              "**參數：**\n" +
              "• `類別`（可選）- 查看特定分類排行\n" +
              "• `數量`（可選）- 顯示前幾名（5-20，預設 10）\n\n" +
              "**範例：**\n" +
              "• `/食物排行` - 總排行 Top 10\n" +
              "• `/食物排行 類別:飲料 數量:20` - 飲料排行 Top 20",
            inline: false,
          },
          {
            name: "🥤 /查看飲料店",
            value:
              "**功能：** 查看所有可用的飲料店清單\n" +
              "**說明：** 顯示所有飲料店名稱和品項數量",
            inline: false,
          }
        )
        .setFooter({ text: "第 2 頁 / 6 頁 - 食物系統（基本）" })
        .setTimestamp();

      pages.push(foodBasicPage);

      // ========== 第 3 頁：食物系統 - 進階 ==========
      const foodAdvancedPage = new EmbedBuilder()
        .setTitle("🍽️ 食物系統 - 進階管理")
        .setDescription("管理和維護食物資料庫的進階指令。")
        .setColor(baseColor)
        .addFields(
          {
            name: "➕ /新增食物",
            value:
              "**功能：** 新增單一食物\n" +
              "**參數：**\n" +
              "• `食物名稱`（必填）- 食物的名稱\n" +
              "• `類別`（必填）- 早餐/午餐/晚餐/宵夜/飲料\n" +
              "• `飲料店`（可選）- 飲料店名稱（僅飲料需要）\n\n" +
              "**範例：**\n" +
              "• `/新增食物 食物名稱:蛋餅 類別:早餐`\n" +
              "• `/新增食物 食物名稱:熟成紅茶 類別:飲料 飲料店:可不可紅茶`",
            inline: false,
          },
          {
            name: "📝 /批次新增食物",
            value:
              "**功能：** 一次新增多個食物（用逗號分隔）\n" +
              "**參數：**\n" +
              "• `食物清單`（必填）- 用逗號分隔的食物名稱\n" +
              "• `類別`（必填）- 食物分類\n" +
              "• `飲料店`（可選）- 飲料店名稱\n\n" +
              "**範例：**\n" +
              "`/批次新增食物 食物清單:蛋餅,三明治,漢堡 類別:早餐`",
            inline: false,
          },
          {
            name: "🗑️ /刪除食物",
            value:
              "**功能：** 刪除食物\n" +
              "**參數：**\n" +
              "• `食物名稱`（必填）- 要刪除的食物名稱\n" +
              "• `類別`（可選）- 如有同名食物請指定\n" +
              "• `飲料店`（可選）- 飲料店名稱\n\n" +
              "**說明：** 如果有同名食物，系統會提示你選擇正確的分類。",
            inline: false,
          }
        )
        .setFooter({ text: "第 3 頁 / 6 頁 - 食物系統（進階）" })
        .setTimestamp();

      pages.push(foodAdvancedPage);

      // ========== 第 4 頁：飲料管理系統 ==========
      const beveragePage = new EmbedBuilder()
        .setTitle("🥤 飲料管理系統")
        .setDescription("專門用於管理手搖飲店菜單的強大工具！")
        .setColor(baseColor)
        .addFields(
          {
            name: "📥 /匯入飲料店菜單",
            value:
              "**功能：** 快速匯入整個飲料店的完整菜單\n" +
              "**參數：**\n" +
              "• `飲料店`（必填）- 飲料店名稱\n" +
              "• `菜單`（必填）- 品項清單（支援換行、逗號、分號分隔）\n" +
              "• `覆蓋現有`（可選）- 是否刪除現有菜單後重建\n\n" +
              "**支援的輸入格式：**\n" +
              "1️⃣ 換行分隔（推薦）\n" +
              "```\n菜單:翡翠檸檬\n珍珠奶茶\n黑糖鮮奶\n```\n" +
              "2️⃣ 逗號分隔\n" +
              "```\n菜單:翡翠檸檬,珍珠奶茶,黑糖鮮奶\n```\n" +
              "3️⃣ 混合格式也可以！",
            inline: false,
          },
          {
            name: "💡 使用技巧",
            value:
              "• 從飲料店官網複製菜單，直接貼上即可\n" +
              "• 支援一次匯入數十項品項\n" +
              "• 自動去重，不會重複新增\n" +
              "• 顯示詳細的匯入報告",
            inline: false,
          },
          {
            name: "📊 匯入報告包含",
            value:
              "✅ 成功新增數量\n" +
              "⏭️ 已存在跳過數量\n" +
              "📝 總共處理數量\n" +
              "📋 新增品項列表\n" +
              "📊 店家總品項數",
            inline: false,
          },
          {
            name: "🔄 更新菜單",
            value:
              "使用 `覆蓋現有:是` 參數可以刪除舊菜單並重新匯入，\n" +
              "適合用於飲料店推出新品或停售舊品時。",
            inline: false,
          }
        )
        .setFooter({ text: "第 4 頁 / 6 頁 - 飲料管理系統" })
        .setTimestamp();

      pages.push(beveragePage);

      // ========== 第 5 頁：票務系統 ==========
      const ticketPage = new EmbedBuilder()
        .setTitle("🎫 票務系統")
        .setDescription("需要幫助？使用票務系統聯繫支援團隊！")
        .setColor(baseColor)
        .addFields(
          {
            name: "🎫 /create-ticket",
            value:
              "**功能：** 創建支援票務\n" +
              "**說明：** 創建一個私人頻道，只有你和支援團隊能看到。\n" +
              "適合用於回報問題、提出建議或尋求協助。",
            inline: false,
          },
          {
            name: "🔒 /close-ticket",
            value:
              "**功能：** 關閉當前票務\n" +
              "**說明：** 在票務頻道中使用此指令關閉票務。\n" +
              "頻道將在 5 秒後自動刪除。",
            inline: false,
          },
          {
            name: "💡 使用流程",
            value:
              "1️⃣ 使用 `/create-ticket` 創建票務\n" +
              "2️⃣ 在專屬頻道中描述你的問題\n" +
              "3️⃣ 等待支援團隊回覆\n" +
              "4️⃣ 問題解決後使用 `/close-ticket` 關閉",
            inline: false,
          },
          {
            name: "⚠️ 注意事項",
            value:
              "• 一次只能開啟一個票務\n" +
              "• 請詳細描述你的問題\n" +
              "• 支援團隊會盡快回覆",
            inline: false,
          }
        )
        .setFooter({ text: "第 5 頁 / 6 頁 - 票務系統" })
        .setTimestamp();

      pages.push(ticketPage);

      // ========== 第 6 頁：其他功能 ==========
      const otherPage = new EmbedBuilder()
        .setTitle("🎮 其他功能")
        .setDescription("更多實用的機器人功能！")
        .setColor(baseColor)
        .addFields(
          {
            name: "📊 統計系統",
            value:
              "機器人會自動記錄以下統計資訊：\n" +
              "• 💬 訊息統計\n" +
              "• 🎤 語音統計\n" +
              "• 📈 頻道活躍度\n" +
              "• 🏆 食物排行榜",
            inline: false,
          },
          {
            name: "🗳️ 投票系統",
            value:
              "遊戲提案投票功能：\n" +
              "• 自動收集玩家和支持者意見\n" +
              "• 24 小時投票期限\n" +
              "• 達到門檻自動通過",
            inline: false,
          },
          {
            name: "🌅 每日早安",
            value:
              "每天早上 8 點自動發送早安訊息：\n" +
              "• 顯示日期和假日資訊\n" +
              "• 今日抽卡運勢\n" +
              "• USD/NTD 匯率資訊",
            inline: false,
          },
          {
            name: "🎭 趣味指令",
            value:
              "• `/gaslight` - 查看 Gaslight 貼文列表\n" +
              "• 更多趣味功能持續開發中...",
            inline: false,
          },
          {
            name: "💡 小提示",
            value:
              "定期使用 `/help` 查看是否有新功能更新！\n" +
              "有建議或問題？使用 `/create-ticket` 聯繫我們！",
            inline: false,
          }
        )
        .setFooter({ text: "第 6 頁 / 6 頁 - 其他功能" })
        .setTimestamp();

      pages.push(otherPage);

      // 使用 buttonPaginator 顯示翻頁
      await buttonPaginator(interaction, pages, 60 * 1000); // 60 秒超時
    } catch (error) {
      console.log(
        `[ERROR] An error occurred inside the help command:\n${error}`.red
      );
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ 載入幫助手冊時發生錯誤，請稍後再試！",
          ephemeral: true,
        });
      }
    }
  },
};
