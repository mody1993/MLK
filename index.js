import 'dotenv/config';
import wolfjs from 'wolf.js';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import fetch from 'node-fetch';

const { WOLF } = wolfjs;
const client = new WOLF();

// --- الإعدادات ---
const TARGET_USER_ID = 80055399 ;
const CHANNEL_TASKS = 81889058; // تأكد من رقم القناة
const ALLOWED_PLAYERS = ['أوكسجينه', 'أوكسجيته', 'أوكسجيئه'];

// --- متغيرات النظام (حالة مستقرة) ---
let isFarming = false; 
let taskTimer = null;
let currentTaskInterval = 306000; // الافتراضي 5 دقائق (306 ثانية)

// --- 1. دوال الكابتشا (مستقلة) ---
async function solveCaptchaAndRespond(message) {
    try {
        const response = await fetch(message.body);
        const buffer = Buffer.from(await response.arrayBuffer());
        
        // التحقق من اللون
        const { data, info } = await sharp(buffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
        let redPixels = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 120 && data[i] > (data[i + 1] + 30) && data[i] > (data[i + 2] + 30)) redPixels++;
        }
        if ((redPixels / (info.width * info.height)) * 100 <= 40) return;

        // الاستخراج والحل
        const worker = await createWorker('ara+eng');
        const { data: { text } } = await worker.recognize(buffer);
        await worker.terminate();

        const nameMatch = text.match(/اللاعب[:\s]+([^\n\r]+)/u);
        const playerName = nameMatch ? nameMatch[1].trim() : "";

        if (ALLOWED_PLAYERS.some(n => playerName.includes(n))) {
            const code = text.match(/\d{4}/)?.[0]; // استخراج الكود
            if (code) await client.messaging.sendGroupMessage(message.targetGroupId, `#${code}`);
        }
    } catch (e) { console.log("خطأ كابتشا:", e.message); }
}

// --- 2. إدارة المهام (مستقلة) ---
function startTaskTimer() {
    if (taskTimer) clearInterval(taskTimer);
    
    // تنفيذ المهام فوراً
    executeTasks();
    
    // ثم بدء التكرار
    taskTimer = setInterval(executeTasks, currentTaskInterval);
}

async function executeTasks() {
    try {
        await client.messaging.sendGroupMessage(CHANNEL_TASKS, '!مد مهام');
        await new Promise(r => setTimeout(r, 2000));
        await client.messaging.sendGroupMessage(CHANNEL_TASKS, '!مد تحالف ايداع كل');
    } catch (e) { console.error("خطأ في المهام:", e.message); }
}

// --- 3. إدارة الصناديق (تنفذ مرة واحدة عند الطلب) ---
async function processBoxes(body) {
    if (isFarming) return; // قفل لمنع التكرار

    const gMatch = body.match(/ذهبي:\s*(\d+)/);
    const pMatch = body.match(/نقاط الضمان:\s*(\d+)/);
    const statusMatch = body.match(/حالة الضمان:\s*(.*)/);
    const timeMatch = body.match(/الجهاز الزمني:\s*(.*)/);

    if (!gMatch || !pMatch || !statusMatch) return;

    // تحديث التوقيت بناءً على الحالة
    const newInterval = (timeMatch && (timeMatch[1].includes('س') || timeMatch[1].includes('د'))) ? 64000 : 306000;
    if (newInterval !== currentTaskInterval) {
        currentTaskInterval = newInterval;
        startTaskTimer(); // إعادة ضبط المؤقت
    }

    const gold = parseInt(gMatch[1]);
    const silver = parseInt(body.match(/فضي:\s*(\d+)/)?.[1] || 0);
    const bronze = parseInt(body.match(/برونزي:\s*(\d+)/)?.[1] || 0);
    const points = parseInt(pMatch[1]);
    const isReady = statusMatch[1].includes('جاهز');

    const target = isReady ? 45 : 999; // 999 تعني فتح كل شيء
    if (points >= target) return;

    isFarming = true;
    let p = points;
    let g = gold, s = silver, b = bronze;

    while (p < target && (g > 0 || s > 0 || b > 0)) {
        let cmd = "";
        if (g > 0) { cmd = '!مد صندوق فتح ذهبي'; g--; p += 4; }
        else if (s > 0) { cmd = '!مد صندوق فتح فضي'; s--; p += 2; }
        else if (b > 0) { cmd = '!مد صندوق فتح برونزي'; b--; p += 1; }

        if (cmd) {
            await client.messaging.sendGroupMessage(CHANNEL_TASKS, cmd);
            await new Promise(r => setTimeout(r, 10000)); // 10 ثواني ثابتة
        } else break;
    }
    isFarming = false;
}

// --- المستمع الرئيسي ---
client.on('groupMessage', async (message) => {
    if (message.sourceSubscriberId != TARGET_USER_ID) return;

    // 1. الكابتشا
    if (message.type === 'text/image_link') {
        await solveCaptchaAndRespond(message);
        return;
    }

    // 2. حالة الصناديق
    if (message.body.includes('حالة الصناديق')) {
        await processBoxes(message.body);
    }
});

client.on('ready', () => {
    console.log("🚀 البوت يعمل بكامل طاقته.");
    // بدء المهام
    startTaskTimer();
    // إرسال طلب الصناديق الأول
    client.messaging.sendGroupMessage(CHANNEL_TASKS, '!مد صندوق');
    // تكرار طلب الصناديق كل 30 دقيقة
    setInterval(() => client.messaging.sendGroupMessage(CHANNEL_TASKS, '!مد صندوق'), 30 * 60 * 1000);
});

client.login(process.env.U_MAIL, process.env.U_PASS);
