import 'dotenv/config';
import wolfjs from 'wolf.js';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';

const { WOLF } = wolfjs;
const client = new WOLF();

// --- الإعدادات ---
const TARGET_USER_ID = 76023604; // ID مرسل البطاقات
const CHANNEL_ID = 224;         // ID القناة
// قائمة الأسماء المسموح بها (أضف هنا كل الاحتمالات التي قد يخطئ فيها OCR)
const ALLOWED_PLAYERS = ['أوكسجينه', 'أوكسجيئه', 'أوكسجيته'];

// وظيفة تنظيف الاسم من أي رموز غير مرئية أو نقاط
function normalizeName(name) {
    return name.replace(/[.\-_\s‎‏]/g, '').toLowerCase();
}

client.on('ready', async () => {
    console.log(`🚀 البوت متصل!`);
    await client.group.joinById(CHANNEL_ID);
    startAutomation();
});

// --- الأتمتة ---
async function startAutomation() {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    async function runCycle() {
        try {
            await sleep(1000); // انتظار 1 ثانية
            await client.messaging.sendGroupMessage(CHANNEL_ID, '!مد مهام');
            await sleep(2000); // انتظار 2 ثانية
            await client.messaging.sendGroupMessage(CHANNEL_ID, '!مد تحالف ايداع كل');
            console.log(`✅ تم تنفيذ الأوامر بنجاح.`);
        } catch (err) {
            console.error("❌ خطأ في الأتمتة:", err.message);
        }
        await sleep(64000); // انتظار 66 ثانية للدورة التالية
        runCycle();
    }
    runCycle();
}

// --- معالجة الصور ---
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
    } catch (e) {
        return "";
    }
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

// --- الاستقبال ---
client.on('groupMessage', async (message) => {
    if (message.targetGroupId != CHANNEL_ID || message.sourceSubscriberId != TARGET_USER_ID) return;
    if (message.type !== 'text/image_link') return;

    try {
        const response = await fetch(message.body);
        const buffer = Buffer.from(await response.arrayBuffer());

        if (!(await isCaptchaByColor(buffer))) return;

        const rawName = await extractPlayerName(buffer);
        const cleanName = normalizeName(rawName);
        
        // التحقق من الاسم ضمن القائمة المسموحة
        const isAuthorized = ALLOWED_PLAYERS.some(allowed => cleanName.includes(normalizeName(allowed)));
        
        if (!isAuthorized) {
            console.log(`⏭️ تجاهل: الاسم "${rawName}" غير مطابق.`);
            return;
        }

        console.log(`✅ الاسم "${rawName}" مطابق! جاري الحل...`);
        const code = await solveCaptcha(buffer);
        if (code) {
            await client.messaging.sendGroupMessage(CHANNEL_ID, `#${code}`);
            console.log(`✅ تم الإرسال: #${code}`);
        }
    } catch (err) {
        console.error("⚠️ خطأ:", err.message);
    }
});

client.login(process.env.U_MAIL, process.env.U_PASS);
