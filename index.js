import 'dotenv/config';
import wolfjs from 'wolf.js';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import fetch from 'node-fetch';

const { WOLF } = wolfjs;

// ================== ACCOUNTS ==================
const ACCOUNTS = [
    { email: process.env.U_MAIL_1, password: process.env.U_PASS_1, allowedPlayers: ['King'] },
    { email: process.env.U_MAIL_2, password: process.env.U_PASS_2, allowedPlayers: ['KSA'] },
    { email: process.env.U_MAIL_3, password: process.env.U_PASS_3, allowedPlayers: ['MKH'] },
    { email: process.env.U_MAIL_4, password: process.env.U_PASS_4, allowedPlayers: ['SAA'] },
    { email: process.env.U_MAIL_5, password: process.env.U_PASS_5, allowedPlayers: ['JDH'] },
    { email: process.env.U_MAIL_6, password: process.env.U_PASS_6, allowedPlayers: ['MLK'] }
];

// ================== ثابت للجميع ==================
const CHANNEL_ID = 569;
const TARGET_USER_ID = 84520028;

// ================== HELPERS ==================
function cleanText(text) {
    if (!text) return "";
    const match = text.match(/[a-zA-Z0-9\u0621-\u064A]+/g);
    return match ? match.join('') : "";
}

function formatAnswer(text) {
    return "#" + cleanText(text);
}

// ================== BOT ==================
function createBotInstance(config) {

    const bot = new WOLF();

    let globalTimer = 0;
    let solvedCache = new Set();

    // ================= CAPTCHA =================
    async function isCaptchaByColor(buffer) {
        const { data, info } = await sharp(buffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true });

        let redPixels = 0;
        const total = info.width * info.height;

        for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 120 && data[i] > data[i + 1] + 30 && data[i] > data[i + 2] + 30) {
                redPixels++;
            }
        }

        return (redPixels / total) * 100 > 40;
    }

    async function extractPlayerName(buffer) {
        try {
            const processed = await sharp(buffer).greyscale().threshold(160).toBuffer();

            const worker = await createWorker('ara+eng');
            const { data: { text } } = await worker.recognize(processed);
            await worker.terminate();

            const match = text.match(/اللاعب[:\s]+([^\n\r]+)/u);
            return match ? match[1].trim() : "";

        } catch {
            return "";
        }
    }

    async function solveCaptcha(buffer) {

        const { data, info } = await sharp(buffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true });

        let minX = info.width, minY = info.height, maxX = 0, maxY = 0, found = false;

        for (let y = 0; y < info.height; y++) {
            for (let x = 0; x < info.width; x++) {
                const i = (y * info.width + x) * 4;

                if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] < 100) {
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                    found = true;
                }
            }
        }

        if (!found) return null;

        const processed = await sharp(buffer)
            .extract({
                left: minX + 10,
                top: minY + 10,
                width: (maxX - minX) - 20,
                height: (maxY - minY) - 20
            })
            .greyscale()
            .sharpen()
            .toBuffer();

        const worker = await createWorker('eng+ara');
        await worker.setParameters({ tessedit_pageseg_mode: '7' });

        const { data: { text } } = await worker.recognize(processed);
        await worker.terminate();

        return cleanText(text);
    }

    // ================== فتح الصناديق ==================
    async function processBoxOpening(g, s, b, points, isNotReady) {

        const send = async (cmd) => {
            await bot.messaging.sendGroupMessage(CHANNEL_ID, cmd);
            await new Promise(r => setTimeout(r, 10000));
        };

        if (isNotReady) {

            while (g-- > 0) await send('!مد صندوق فتح ذهبي');
            while (s-- > 0) await send('!مد صندوق فتح فضي');
            while (b-- > 0) await send('!مد صندوق فتح برونزي');

            return;
        }

        if (points < 42) {

            let need = 42 - points;

            while (need > 0) {

                if (need >= 4 && g > 0) {
                    await send('!مد صندوق فتح ذهبي');
                    g--; need -= 4;
                }
                else if (need >= 2 && s > 0) {
                    await send('!مد صندوق فتح فضي');
                    s--; need -= 2;
                }
                else if (need >= 1 && b > 0) {
                    await send('!مد صندوق فتح برونزي');
                    b--; need -= 1;
                }
                else break;
            }
        }
    }

    // ================== فحص الصناديق ==================
    async function sendBoxCommand() {

        return new Promise((resolve) => {

            bot.messaging.sendGroupMessage(CHANNEL_ID, '!مد صندوق');

            const handler = async (message) => {

                if (
                    message.targetGroupId === CHANNEL_ID &&
                    message.body.startsWith('/me 📦 حالة الصناديق')
                ) {

                    const body = message.body;

                    const isNotReady = body.includes("غير جاهز");

                    const boxes = body.match(/برونزي:\s*(\d+)\s*\|\s*فضي:\s*(\d+)\s*\|\s*ذهبي:\s*(\d+)/);
                    const points = body.match(/نقاط الضمان:\s*(\d+)\/50/);

                    await processBoxOpening(
                        boxes ? +boxes[3] : 0,
                        boxes ? +boxes[2] : 0,
                        boxes ? +boxes[1] : 0,
                        points ? +points[1] : 0,
                        isNotReady
                    );

                    // الجهاز الزمني
                    const timerLine = body.split('\n').find(l =>
                        l.includes('الجهاز الزمني') || l.includes('⏳')
                    );

                    let temp = 0;

                    if (timerLine && !timerLine.includes("غير نشط")) {

                        const h = timerLine.match(/(\d+)س/);
                        const m = timerLine.match(/(\d+)د/);
                        const s = timerLine.match(/(\d+)ث/);

                        if (h) temp += +h[1] * 3600;
                        if (m) temp += +m[1] * 60;
                        if (s) temp += +s[1];

                    } else if (!isNotReady) {

                        await bot.messaging.sendGroupMessage(CHANNEL_ID, '!مد صندوق ضمان وقت');
                        temp = 3 * 3600;
                    }

                    globalTimer = temp;

                    bot.removeListener('groupMessage', handler);
                    resolve();
                }
            };

            bot.on('groupMessage', handler);

            setTimeout(() => {
                bot.removeListener('groupMessage', handler);
                resolve();
            }, 12000);
        });
    }

    // ================== LOOP ==================
    async function startTaskLoop() {

        while (true) {
            try {

                await bot.messaging.sendGroupMessage(CHANNEL_ID, '!مد مهام');
                await new Promise(r => setTimeout(r, 2000));

                await bot.messaging.sendGroupMessage(CHANNEL_ID, '!مد تحالف ايداع كل');

                if (globalTimer > 0) {

                    globalTimer = Math.max(0, globalTimer - 63);
                    await new Promise(r => setTimeout(r, 63000));

                } else {

                    await new Promise(r => setTimeout(r, 303000));
                    await sendBoxCommand();
                }

            } catch (e) {
                console.error(`[${config.email}]`, e.message);
                await new Promise(r => setTimeout(r, 5000));
            }
        }
    }

    // ================== EVENTS ==================
    bot.on('groupMessage', async (message) => {

        if (
            message.sourceSubscriberId !== TARGET_USER_ID ||
            message.targetGroupId !== CHANNEL_ID
        ) return;

        try {

            const res = await fetch(message.body);
            const buffer = Buffer.from(await res.arrayBuffer());

            if (!(await isCaptchaByColor(buffer))) return;

            const playerName = await extractPlayerName(buffer);

            if (!config.allowedPlayers.some(p => playerName.includes(p))) return;

            const code = await solveCaptcha(buffer);

            if (!code) return;

            if (solvedCache.has(code)) return;

            solvedCache.add(code);
            setTimeout(() => solvedCache.delete(code), 30000);

            await bot.messaging.sendGroupMessage(
                CHANNEL_ID,
                formatAnswer(code)
            );

        } catch (err) {
            console.error(`[${config.email}] captcha error`, err.message);
        }
    });

    // ================== READY ==================
    bot.on('ready', async () => {

        console.log(`✅ Logged in: ${config.email}`);

        await sendBoxCommand();
        setInterval(sendBoxCommand, 30 * 60 * 1000);

        startTaskLoop();
    });

    bot.login(config.email, config.password);
}

// ================== START ==================
ACCOUNTS.forEach((acc, i) => {

    setTimeout(() => {
        console.log(`🚀 تشغيل الحساب ${i + 1}`);
        createBotInstance(acc);
    }, i * 35000);

});
