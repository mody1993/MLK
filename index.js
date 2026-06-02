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

// --- متغيرات الحالة ---
let isSystemActive = false;
let isFarming = false; 
let b = null; 
let waitingForData = false;
let dataReceived = false;

// --- 1. نظام طلب الحالة مع إعادة المحاولة ---
async function sendRequestWithRetry() {
    waitingForData = true;
    dataReceived = false;
    
    console.log("[LOG] 📤 جارٍ طلب بيانات الصناديق...");
    await client.messaging.sendGroupMessage(CHANNEL_TASKS, '!مد صندوق');
    
    // انتظر 4 ثوانٍ للتأكد من وصول البيانات، إذا لم تصل، انتظر 10 ثوانٍ وأعد المحاولة
    setTimeout(async () => {
        if (!dataReceived && waitingForData) {
            console.log("[LOG] ⏳ لم تصل البيانات خلال 4 ثوانٍ. إعادة المحاولة بعد 10 ثوانٍ...");
            setTimeout(sendRequestWithRetry, 10000);
        }
    }, 4000);
}

// --- 2. نظام الزراعة الذكي (المنطق الرياضي) ---
async function executeFarmingStrategy(gold, silver, bronze, currentPoints, status) {
    if (isFarming) return;
    const isReady = status.includes('جاهز');

    // شرط التوقف: إذا الحالة جاهز والنقاط كافية (>= 40)
    if (isReady && currentPoints >= 40) return;

    isFarming = true;
    console.log(`[LOG] 🧮 بدء الزراعة: الحالة (${status}) | النقاط: ${currentPoints}/50`);

    let p = currentPoints;
    let g = gold, s = silver, b = bronze;
    let queue = [];

    // خوارزمية الحساب
    while (g > 0 || s > 0 || b > 0) {
        // إذا جاهز: نتوقف عند وصول النقاط لـ 40
        if (isReady && p >= 40) break;

        if (g > 0) { queue.push('!مد صندوق فتح ذهبي'); g--; p += 4; }
        else if (s > 0) { queue.push('!مد صندوق فتح فضي'); s--; p += 2; }
        else if (b > 0) { queue.push('!مد صندوق فتح برونزي'); b--; p += 1; }
        else break;
    }

    if (queue.length === 0) {
        isFarming = false;
        return;
    }

    console.log(`[LOG] 📋 الخطة: سيتم فتح ${queue.length} صندوق.`);
    
    for (const cmd of queue) {
        await client.messaging.sendGroupMessage(CHANNEL_TASKS, cmd);
        console.log(`[LOG] ⏳ تنفيذ: ${cmd}. انتظار 20ث...`);
        await new Promise(r => setTimeout(r, 20000));
    }

    isFarming = false;
    console.log("[LOG] ✅ انتهت عملية الزراعة.");
}

// --- 3. إدارة المهام ---
async function performTasks() {
    try {
        await client.messaging.sendGroupMessage(CHANNEL_TASKS, '!مد مهام');
        await new Promise(r => setTimeout(r, 2000));
        await client.messaging.sendGroupMessage(CHANNEL_ALLIANCE, '!مد تحالف ايداع كل');
    } catch (e) { console.error(`[ERROR] ${e.message}`); }
}

function manageTimer() {
    let intervalMs = isSystemActive ? 64000 : 306000;
    if (b) clearInterval(b);
    performTasks(); 
    b = setInterval(performTasks, intervalMs);
}

// --- 4. دوال الكابتشا ---
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
    // 1. منطق الكابتشا
    const isTargetChannel = (message.targetGroupId === CHANNEL_TASKS || message.targetGroupId === CHANNEL_ALLIANCE);
    if (isTargetChannel && message.sourceSubscriberId == TARGET_USER_ID && message.type === 'text/image_link') {
        try {
            const response = await fetch(message.body);
            const buffer = Buffer.from(await response.arrayBuffer());
            if (!(await isCaptchaByColor(buffer))) return;

            const name = await extractPlayerName(buffer);
            if (ALLOWED_PLAYERS.some(p => name.toLowerCase().includes(p.toLowerCase()))) {
                const code = await solveCaptcha(buffer);
                if (code) await client.messaging.sendGroupMessage(message.targetGroupId, `#${code}`);
            }
        } catch (err) { console.error("⚠️ خطأ كابتشا:", err.message); }
        return;
    }

    // 2. معالجة بيانات الصناديق والزراعة
    if (message.sourceSubscriberId !== TARGET_USER_ID) return;
    
    const body = message.body;
    const gMatch = body.match(/ذهبي:\s*(\d+)/);
    const pMatch = body.match(/نقاط الضمان:\s*(\d+)/);
    const statusMatch = body.match(/حالة الضمان:\s*(.*)/);

    if (gMatch && pMatch && statusMatch) {
        dataReceived = true; // تم استلام البيانات
        waitingForData = false;
        
        const gold = parseInt(gMatch[1]);
        const silver = parseInt(body.match(/فضي:\s*(\d+)/)[1]);
        const bronze = parseInt(body.match(/برونزي:\s*(\d+)/)[1]);
        const points = parseInt(pMatch[1]);
        const status = statusMatch[1].trim();

        // تنفيذ الزراعة
        await executeFarmingStrategy(gold, silver, bronze, points, status);

        // ضبط المؤقتات
        const timeMatch = body.match(/الجهاز الزمني:\s*(.*)/);
        const timeStatus = timeMatch ? timeMatch[1].trim() : "";
        
        if (timeStatus.includes('س') || timeStatus.includes('د')) {
            isSystemActive = true;
        } else if (timeStatus.includes('غير نشط') && status === "جاهز") {
            await client.messaging.sendGroupMessage(CHANNEL_TASKS, '!مد صندوق ضمان وقت');
            isSystemActive = true;
        } else {
            isSystemActive = false;
        }
        manageTimer();
    }
});

client.on('ready', () => {
    console.log("🚀 البوت متصل ومستعد.");
    
    // الطلب الأول
    sendRequestWithRetry();
    
    // تكرار الطلب كل 30 دقيقة
    setInterval(sendRequestWithRetry, 30 * 60 * 1000);
    
    manageTimer();
});

client.login(process.env.U_MAIL, process.env.U_PASS);
