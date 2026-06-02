import 'dotenv/config';
import wolfjs from 'wolf.js';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import fetch from 'node-fetch';

const { WOLF } = wolfjs;
const client = new WOLF();

// --- الإعدادات ---
const TARGET_USER_ID = 80055399;
const CHANNEL_ID = 81889058;
const ALLOWED_PLAYERS = ['أوكسجينه', 'أوكسجيته', 'أوكسجيئه'];

// متغير عام لتخزين التايمر
let globalTimer = 0;

// --- الدوال الأساسية (كما هي) ---
async function isCaptchaByColor(buffer) {
    const { data, info } = await sharp(buffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    let redPixels = 0;
    const totalPixels = info.width * info.height;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 120 && data[i] > (data[i + 1] + 30) && data[i] > (data[i + 2] + 30)) redPixels++;
    }
    return (redPixels / totalPixels) * 100 > 40;
}

async function extractPlayerName(buffer) {
    try {
        const processedBuffer = await sharp(buffer).greyscale().threshold(160).toBuffer();
        const worker = await createWorker('ara+eng');
        const { data: { text } } = await worker.recognize(processedBuffer);
        await worker.terminate();
        const match = text.match(/اللاعب[:\s]+([^\n\r]+)/u);
        return match ? match[1].trim() : "";
    } catch (e) { return ""; }
}

async function solveCaptcha(buffer) {
    const { data, info } = await sharp(buffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    let minX = info.width, minY = info.height, maxX = 0, maxY = 0, found = false;
    for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
            const idx = (y * info.width + x) * 4;
            if (data[idx] > 200 && data[idx + 1] > 200 && data[idx + 2] < 100) {
                minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
                found = true;
            }
        }
    }
    if (!found) return null;
    const margin = 10;
    const processedBuffer = await sharp(buffer)
        .extract({ left: minX + margin, top: minY + margin, width: (maxX - minX) - (margin * 2), height: (maxY - minY) - (margin * 2) })
        .greyscale().normalize().linear(1.5, -0.2).sharpen().toBuffer();
    const worker = await createWorker('eng+ara');
    await worker.setParameters({ tessedit_pageseg_mode: '7' });
    const { data: { text } } = await worker.recognize(processedBuffer);
    await worker.terminate();
    return text.replace(/[^a-zA-Z0-9\u0621-\u064A]/g, '').trim();
}

// --- المعالجة الرئيسية للكابتشا ---
client.on('groupMessage', async (message) => {
    if (message.sourceSubscriberId != TARGET_USER_ID) return;
    if (message.targetGroupId != CHANNEL_ID) return;
    if (message.type !== 'text/image_link') return;

    try {
        const response = await fetch(message.body);
        const buffer = Buffer.from(await response.arrayBuffer());
        if (!(await isCaptchaByColor(buffer))) return;

        const playerName = await extractPlayerName(buffer);
        if (ALLOWED_PLAYERS.some(n => playerName.includes(n))) {
            const code = await solveCaptcha(buffer);
            if (code) await client.messaging.sendGroupMessage(CHANNEL_ID, `#${code}`);
        }
    } catch (err) { console.error("⚠️ خطأ في الكابتشا:", err.message); }
});

// --- حلقة فحص الصناديق (كل 30 دقيقة) ---
const sendBoxCommand = async () => {
    try {
        await client.messaging.sendGroupMessage(CHANNEL_ID, '!مد صندوق');
        
        const responseHandler = async (message) => {
            if (message.targetGroupId == CHANNEL_ID && message.body.startsWith('/me 📦 حالة الصناديق')) {
                const matchA = message.body.match(/حالة الضمان:\s*(.*)/);
                const matchB = message.body.match(/الجهاز الزمني:\s*(.*)/);
                const a = matchA ? matchA[1].trim() : "";
                const b = matchB ? matchB[1].trim() : "";

                let tempTimer = 0;
                if (b.includes("غير نشط")) {
                    if (!a.includes("غير جاهز")) {
                        await client.messaging.sendGroupMessage(CHANNEL_ID, '!مد صندوق ضمان وقت');
                        tempTimer = 3 * 60 * 60;
                    }
                } else {
                    const h = b.match(/(\d+)س/);
                    const m = b.match(/(\d+)د/);
                    const s = b.match(/(\d+)ث/);
                    if (h) tempTimer += parseInt(h[1]) * 3600;
                    if (m) tempTimer += parseInt(m[1]) * 60;
                    if (s) tempTimer += parseInt(s[1]);
                }
                globalTimer = tempTimer;
                console.log(`⏱ تم تحديث التايمر إلى: ${globalTimer} ثانية`);
                client.removeListener('groupMessage', responseHandler);
            }
        };

        client.on('groupMessage', responseHandler);
        setTimeout(() => client.removeListener('groupMessage', responseHandler), 10000);
    } catch (err) { console.error("⚠️ خطأ في أمر الصندوق:", err.message); }
};

// --- حلقة الأوامر المتكررة ---
const startTaskLoop = async () => {
    while (true) {
        await client.messaging.sendGroupMessage(CHANNEL_ID, '!مد مهام');
        await new Promise(resolve => setTimeout(resolve, 2000)); // انتظار ثانيتين
        await client.messaging.sendGroupMessage(CHANNEL_ID, '!مد تحالف ايداع كل');

        // تحديد وقت الانتظار بناءً على التايمر
        let x = (globalTimer === 0) ? 306000 : 64000;
        console.log(`⏳ انتظار لمدة ${x/1000} ثانية. التايمر الحالي: ${globalTimer}`);
        
        await new Promise(resolve => setTimeout(resolve, x));
    }
};

client.on('ready', () => {
    console.log("🚀 البوت يعمل الآن");
    
    // 1. تنفيذ فحص الصناديق فوراً ثم كل 30 دقيقة
    sendBoxCommand();
    setInterval(sendBoxCommand, 30 * 60 * 1000);

    // 2. بدء حلقة الأوامر
    startTaskLoop();
});

client.login(process.env.U_MAIL, process.env.U_PASS);
