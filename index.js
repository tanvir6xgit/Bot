const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs-extra');
const ytdl = require('@distube/ytdl-core');
const Youtube = require('youtube-search-api');
const path = require('path');
const axios = require('axios');
const express = require('express'); // Import express

// Replace with your Telegram bot token
const token = "6443193981:AAFgZK5nmrs4ZY9UU79_Xv6zHyKYReJKPw4";
const bot = new TelegramBot(token, { polling: true });
const app = express(); // Initialize express

// Create audio directory if not exists
const audioDir = path.join(__dirname, 'audio');
if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir);
}

console.log('Bot starting now...');
app.use('/audio', express.static(audioDir));

// Function to filter out emojis and symbols
function filterEmojisAndSymbols(text) {
    const emojiAndSymbolRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B50}~`!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/gu;
    return text.replace(emojiAndSymbolRegex, '');
}

// Function to download music from YouTube
async function downloadMusicFromYoutube(link, outputPath) {
    const timestart = Date.now();
    const info = await ytdl.getInfo(link);

    return new Promise((resolve, reject) => {
        ytdl(link, { filter: 'audioonly' })
            .pipe(fs.createWriteStream(outputPath))
            .on('close', () => {
                const result = {
                    title: info.videoDetails.title,
                    dur: Number(info.videoDetails.lengthSeconds),
                    publishDate: info.videoDetails.publishDate,
                    viewCount: info.videoDetails.viewCount,
                    likes: info.videoDetails.likes,
                    author: info.videoDetails.author.name,
                    timestart: timestart
                };
                resolve(result);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
}

// Function to convert duration in seconds to H:M:S format
function convertHMS(value) {
    const sec = parseInt(value, 10);
    let hours = Math.floor(sec / 3600);
    let minutes = Math.floor((sec - (hours * 3600)) / 60);
    let seconds = sec - (hours * 3600) - (minutes * 60);
    if (hours < 10) hours = "0" + hours;
    if (minutes < 10) minutes = "0" + minutes;
    if (seconds < 10) seconds = "0" + seconds;
    return (hours !== '00' ? hours + ':' : '') + minutes + ':' + seconds;
}

// Function to delete all specified messages
async function deleteMessages(chatId, messageIds) {
    for (let messageId of messageIds) {
        try {
            await bot.deleteMessage(chatId, messageId);
        } catch (e) {
            console.log(`Failed to delete message ${messageId}: ${e.message}`);
        }
    }
}

// Function to download video and send it
async function downloadAndSendVideo(chatId, apiUrl, resultKey, messageIds) {
    try {
        const response = await axios.get(apiUrl);
        const videoUrl = response.data[resultKey];

        if (videoUrl) {
            await bot.sendVideo(chatId, videoUrl);
        } else {
            await bot.sendMessage(chatId, 'Failed to download the video. Please try again.');
        }

        // Delete all messages (prompt, URL input, etc.)
        await deleteMessages(chatId, messageIds);
    } catch (error) {
        await bot.sendMessage(chatId, 'An error occurred while downloading the video.');
        console.error(error);
    }
}

// Command to search and download music from YouTube
bot.onText(/\/song (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const keyword = match[1];
    const outputPath = path.join(__dirname, 'cache', 'song.mp3');

    let downloadMessage;

    if (keyword.startsWith('https://')) {
        try {
            // Send "downloading" message and store the message object
            downloadMessage = await bot.sendMessage(chatId, "Downloading song...");

            // Download the song
            const data = await downloadMusicFromYoutube(keyword, outputPath);

            // Delete the "downloading" message
            await bot.deleteMessage(chatId, downloadMessage.message_id);

            // **Send the audio with the custom caption**
            await bot.sendAudio(chatId, fs.createReadStream(outputPath), {}, {
                caption: `🖤 Here is Your Choices Music 🤍`
            });

            // Optional: Clean up the downloaded file
            fs.unlinkSync(outputPath);
        } catch (e) {
            bot.sendMessage(chatId, `Error: ${e.message}`);
        }
    } else {
        try {
            // Search for the keyword on YouTube
            const results = await Youtube.GetListByKeyword(keyword, false, 6);
            let message = 'Choose one of the following results by replying with the number:\n\n';
            results.items.forEach((item, index) => {
                message += `${index + 1} - ${item.title} (${item.length.simpleText})\n`;
            });

            // Send the search results message
            const sentMsg = await bot.sendMessage(chatId, message);

            // Listen for the user's reply
            bot.once('message', async (replyMsg) => {
                const selected = parseInt(replyMsg.text) - 1;

                if (results.items[selected]) {
                    // Send "downloading" message and store the message object
                    downloadMessage = await bot.sendMessage(chatId, "🎧 Downloading Music...");

                    // Download the selected song
                    const data = await downloadMusicFromYoutube(`https://www.youtube.com/watch?v=${results.items[selected].id}`, outputPath);

                    // Delete all previous messages (search results, user reply, and "downloading" message)
                    await deleteMessages(chatId, [sentMsg.message_id, replyMsg.message_id, downloadMessage.message_id]);

                    // **Send the audio with the custom caption**
                    await bot.sendAudio(chatId, fs.createReadStream(outputPath), {}, {
                        caption: `🖤 Here is Your Choices Music 🤍`
                    });

                    // Optional: Clean up the downloaded file
                    fs.unlinkSync(outputPath);
                } else {
                    bot.sendMessage(chatId, 'Invalid selection.');
                }
            });
        } catch (e) {
            bot.sendMessage(chatId, `Error: ${e.message}`);
        }
    }
});

// TikTok command
bot.onText(/\/tiktok/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Please send the TikTok video URL:').then((promptMsg) => {
        bot.once('message', async (msg) => {
            const url = msg.text;
            const apiUrl = `https://deku-rest-api.gleeze.com/tiktokdl?url=${encodeURIComponent(url)}`;

            const messageIds = [promptMsg.message_id, msg.message_id];
            await downloadAndSendVideo(chatId, apiUrl, 'result', messageIds);
        });
    });
});

// Facebook command
bot.onText(/\/fb/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Please send the Facebook video URL:').then((promptMsg) => {
        bot.once('message', async (msg) => {
            const url = msg.text;
            const apiUrl = `https://deku-rest-api.gleeze.com/facebook?url=${encodeURIComponent(url)}`;

            const messageIds = [promptMsg.message_id, msg.message_id];
            await downloadAndSendVideo(chatId, apiUrl, 'result', messageIds);
        });
    });
});
// /tts command to convert text to speech
bot.onText(/\/tts (\S+) (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const languageCode = match[1]; // Language code
    const textToConvert = match[2]; // Text to convert

    try {
        const filteredText = filterEmojisAndSymbols(textToConvert);
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(filteredText)}&tl=${languageCode}&client=tw-ob`;

        console.log('Fetching audio from URL:', url);
        const audioBuffer = await axios.get(url, { responseType: 'arraybuffer' });

        const fileName = 'voice_message.mp3';
        const filePath = path.join(audioDir, fileName);

        await fs.writeFile(filePath, audioBuffer.data);

        console.log('Audio file saved at:', filePath);
        bot.sendAudio(chatId, filePath);
    } catch (error) {
        console.error('Error details:', error.message);
        bot.sendMessage(chatId, `Error occurred: ${error.message}`);
    }
});

// /start command to show all available commands
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const message = `
Hello! Here are the commands you can use:
1. /song <keyword or YouTube URL> - Search and download music from YouTube.
2. /tiktok - Download a TikTok video.
3. /fb - Download a Facebook video.
4. /tts <language_code> <text> - Convert text to speech and send it as audio.

Just type the command and follow the instructions!
    `;
    bot.sendMessage(chatId, message);
});