import 'dotenv/config';
import wolfjs from 'wolf.js';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import fetch from 'node-fetch';

const { WOLF } = wolfjs;
const client = new WOLF();

// --- الإعدادات ---
const TARGET_USER_ID = 76023604;
const CHANNEL_TASKS = 224;
const CHANNEL_ALLIANCE = 224;
const ALLOWED_PLAYERS = ['أوكسجينه', 'أوكسجيته', 'أوكسجيئه'];

// --- متغيرات النظام ---
let isSystemActive = false; 
let isFarming = false; // متغير لمنع تداخل عمليات الزراعة
let b = null; 

// --- منطق زراعة الصناديق (10 ثواني) ---
async function executeFarming(gold, silver, bronze, currentPoints, status) {
    if (isFarming) return;
    isFarming = true;
    
    const isReady = status.includes('جاهز');
    let p = currentPoints;
    let g = gold, s = silver, b = bronze;
    let queue = [];

    // الحساب الرياضي:
    // إذا "غير جاهز": نفتح كل شيء حتى تنفذ الصناديق.
    // إذا "جاهز": نفتح فقط حتى نصل إلى 40-45 نقطة ثم نتوقف.
    while (g > 0 || s > 0 || b > 0) {
        if (isReady && p >= 40) break; // شرط التوقف في حالة "جاهز"

        if (g > 0) { queue.push('!مد صندوق فتح ذهبي'); g--; p += 4; }
        else if (s > 0) { queue.push('!مد صندوق فتح فضي'); s--; p += 2; }
        else if (b > 0) { queue.push('!مد صندوق فتح برونزي'); b--; p += 1; }
        else break;
    }

    if (queue.length > 0) {
        console.log(`[LOG] 🚜 بدء الزراعة: سيتم فتح ${queue.length} صندوق.`);
        for (const cmd of queue) {
            await client.messaging.sendGroupMessage(CHANNEL_TASKS, cmd);
            await new Promise(r => setTimeout(r, 10000)); // 10 ثوانٍ كما طلبت
        }
        console.log("[LOG] ✅ انتهت عملية الزراعة.");
    }
    isFarming = false;
}

// --- دالة المهام ---
async function performTasks() {
    console.log(`[LOG] 🚀 بدء دورة المهام.`);
    try {
        await client.messaging.sendGroupMessage(CHANNEL_TASKS, '!مد مهام');
        await new Promise(r => setTimeout(r, 2000));
        await client.messaging.sendGroupMessage(CHANNEL_ALLIANCE, '!مد تحالف ايداع كل');
    } catch (e) { console.error(`[ERROR] ${e.message}`); }
}

// --- إدارة المؤقت ---
function manageTimer() {
    let intervalMs = isSystemActive ? 64000 : 306000;
    if (b) clearInterval(b);
    performTasks(); 
    b = setInterval(performTasks, intervalMs);
}

// --- دوال الكابتشا (تم الإبقاء عليها كما هي) ---
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
        return match ? match[1].trim() : "لم يتم العثور";
    } catch (e) { return "خطأ"; }
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

// --- معالجة الرسائل ---
client.on('groupMessage', async (message) => {
    // 1. الكابتشا
    const isTargetChannel = (message.targetGroupId === CHANNEL_TASKS || message.targetGroupId === CHANNEL_ALLIANCE);
    if (isTargetChannel && message.sourceSubscriberId == TARGET_USER_ID && message.type === 'text/image_link') {
        try {
            const response = await fetch(message.body);
            const buffer = Buffer.from(await response.arrayBuffer());
            if (!(await isCaptchaByColor(buffer))) return;

            const name = await extractPlayerName(buffer);
            if (ALLOWED_PLAYERS.some(p => name.toLowerCase().includes(p.toLowerCase()))) {
                const code = await solveCaptcha(buffer);
                if (code) {
                    console.log(`[LOG] ✅ تم حل الكابتشا: ${code}`);
                    await client.messaging.sendGroupMessage(message.targetGroupId, `#${code}`);
                }
            }
        } catch (err) { console.error("⚠️ خطأ كابتشا:", err.message); }
        return;
    }

    // 2. تحليل الرسائل (الصناديق + المهام)
    if (message.sourceSubscriberId !== TARGET_USER_ID) return;
    
    const body = message.body;

    // أ) تحليل بيانات الصناديق (إذا وجدت في الرسالة)
    const gMatch = body.match(/ذهبي:\s*(\d+)/);
    const sMatch = body.match(/فضي:\s*(\d+)/);
    const bMatch = body.match(/برونزي:\s*(\d+)/);
    const pMatch = body.match(/نقاط الضمان:\s*(\d+)\/50/);
    const statusMatch = body.match(/حالة الضمان:\s*(.*)/);

    if (gMatch && pMatch && statusMatch) {
        const gold = parseInt(gMatch[1]);
        const silver = parseInt(sMatch[1]);
        const bronze = parseInt(bMatch[1]);
        const points = parseInt(pMatch[1]);
        const status = statusMatch[1].trim();

        console.log(`[LOG] 📊 الحالة: ${points}/50 | ${status}`);
        executeFarming(gold, silver, bronze, points, status);
    }

    // ب) تحليل التوقيت والمهام
    const timeMatch = body.match(/الجهاز الزمني[:\s]+(.*)/);
    if (timeMatch) {
        const timeStatus = timeMatch[1].trim();
        let isReady = statusMatch ? statusMatch[1].includes('جاهز') : false;

        if (timeStatus.includes('س') || timeStatus.includes('د')) {
            isSystemActive = true; 
        } 
        else if (timeStatus.includes('غير نشط')) {
            if (isReady) {
                await client.messaging.sendGroupMessage(CHANNEL_TASKS, '!مد صندوق ضمان وقت');
                isSystemActive = true; 
            } else {
                isSystemActive = false; 
            }
        }
        manageTimer();
    }
});

// --- التشغيل ---
client.on('ready', () => {
    console.log("🚀 البوت متصل.");
    
    // إرسال طلب الحالة الأول
    client.messaging.sendGroupMessage(CHANNEL_TASKS, '!مد صندوق');
    
    // جدولة طلب الحالة كل 30 دقيقة
    setInterval(() => {
        client.messaging.sendGroupMessage(CHANNEL_TASKS, '!مد صندوق');
    }, 1800000); 

    manageTimer();
});

client.login(process.env.U_MAIL, process.env.U_PASS);
