import 'dotenv/config';
import wolfjs from 'wolf.js';

const { WOLF } = wolfjs;

// ================== 🎛️ CONTROL PANEL (المتحكم الرئيسي) ==================

// 1. الإعدادات الرئيسية الافتراضية للعب (الغرفة الرئيسية)
const MAIN_ROOM = {
    channelId: 569,         // الغرفة الرئيسية للعب
    targetUserId: 84520028   // مرسل الكابتشا الرئيسي للعب
};

// 2. إعدادات الغرفة الفرعية/الثانية للعب
const SECOND_ROOM = {
     channelId: 13219769,
     targetUserId: 76023171  // مرسل الكابتشا الثاني للعب
};

// 3. 🎯 قنوات وغرفة فحص الصناديق الجديدة (تعديلك الجديد)
// ضع هنا رقم غرفة الفحص الخاصة بك ومعرف الـ ID الخاص بمرسل اللعبة هناك
const CHECK_ROOM = {
    channelId: 18654218,     // 👈 ضع هنا رقم قناة الفحص الخاصة بك
    targetUserId: 76023242   // 👈 ضع هنا معرف حساب اللعبة (المرسل) في قناة الفحص
};

// 4. أسماء الحسابات التي تريد نقلها للغرفة الثانية في اللعب
const SPECIAL_ROOM_USERS = [];
const specialUsersSet = new Set(SPECIAL_ROOM_USERS);

// =========================================================================

// ================== ACCOUNTS LIST (مصفوفة الحسابات) ==================
const ACCOUNTS = [
    { email: process.env.U_MAIL_1,  password: process.env.U_PASS_1,  allowedPlayers: ['King'] },
    { email: process.env.U_MAIL_2,  password: process.env.U_PASS_2,  allowedPlayers: ['KSA'] },
    { email: process.env.U_MAIL_3,  password: process.env.U_PASS_3,  allowedPlayers: ['MKH'] },
    { email: process.env.U_MAIL_4,  password: process.env.U_PASS_4,  allowedPlayers: ['SAA'] },
    { email: process.env.U_MAIL_5,  password: process.env.U_PASS_5,  allowedPlayers: ['JDH'] },
    { email: process.env.U_MAIL_6,  password: process.env.U_PASS_6,  allowedPlayers: ['MLK'] },
    { email: process.env.U_MAIL_7,  password: process.env.U_PASS_7,  allowedPlayers: ['CRN'] },
    { email: process.env.U_MAIL_8,  password: process.env.U_PASS_8,  allowedPlayers: ['REX'] },
    { email: process.env.U_MAIL_9,  password: process.env.U_PASS_9,  allowedPlayers: ['LRD'] },
    { email: process.env.U_MAIL_10, password: process.env.U_PASS_10, allowedPlayers: ['ROY'] },
    { email: process.env.U_MAIL_11, password: process.env.U_PASS_11, allowedPlayers: ['EMP'] },
    { email: process.env.U_MAIL_12, password: process.env.U_PASS_12, allowedPlayers: ['NOR'] },
    { email: process.env.U_MAIL_13, password: process.env.U_PASS_13, allowedPlayers: ['Passion'] }
];

// دالة الانتظار الموحدة
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ================== BOT FACTORY ==================
function createBot(config) {
    const client = new WOLF();
    const PLAY_CHANNEL_ID = config.channelId; // غرفة اللعب (أساسية أو فرعية)
    const botName = config.allowedPlayers[0];  // اسم البوت للـ Logs
    
    let globalTimer = 0; 

    // ================== BOX PROCESSING (قناة الفحص) ==================
    async function processBox(g, s, b, points, notReady) {
        const send = async (cmd) => {
            await client.messaging.sendGroupMessage(CHECK_ROOM.channelId, cmd);
            await sleep(2000); 
        };

        if (notReady) {
            while (g > 0) { await send('!مد صندوق فتح ذهبي'); g--; }
            while (s > 0) { await send('!مد صندوق فتح فضي'); s--; }
            while (b > 0) { await send('!مد صندوق فتح برونزي'); b--; }
            return;
        }

        let need = Math.max(0, 42 - points);
        while (need > 0) {
            if (need >= 4 && g > 0) {
                await send('!مد صندوق فتح ذهبي');
                g--; need -= 4;
            } else if (need >= 2 && s > 0) {
                await send('!مد صندوق فتح فضي');
                s--; need -= 2;
            } else if (need >= 1 && b > 0) {
                await send('!مد صندوق فتح برونزي');
                b--; need -= 1;
            } else {
                break;
            }
        }
    }

    // ================== BOX CHECK WITH FALLBACK (قناة الفحص) ==================
    async function sendBoxCommand() {
        return new Promise((resolve) => {
            console.log(`[${botName}] 🔍 فحص الصناديق في غرفة الفحص من المرسل (${CHECK_ROOM.targetUserId})...`);
            client.messaging.sendGroupMessage(CHECK_ROOM.channelId, '!مد صندوق');

            const handler = async (message) => {
                if (
                    message.sourceSubscriberId === CHECK_ROOM.targetUserId &&
                    message.targetGroupId === CHECK_ROOM.channelId &&
                    typeof message.body === 'string' &&
                    message.body.startsWith('/me 📦 حالة الصناديق')
                ) {
                    const body = message.body;
                    const notReady = body.includes("غير جاهز");

                    const boxes = body.match(/برونزي:\s*(\d+)\s*\|\s*فضي:\s*(\d+)\s*\|\s*ذهبي:\s*(\d+)/);
                    const points = body.match(/نقاط الضمان:\s*(\d+)\/50/);

                    const g = boxes ? parseInt(boxes[3], 10) : 0;
                    const s = boxes ? parseInt(boxes[2], 10) : 0;
                    const b = boxes ? parseInt(boxes[1], 10) : 0;
                    const p = points ? parseInt(points[1], 10) : 0;

                    await processBox(g, s, b, p, notReady);

                    const timerLine = body.split('\n').find(l => l.includes('الجهاز الزمني'));
                    let tempSeconds = 0;

                    if (timerLine?.includes('موقوف')) {
                        await client.messaging.sendGroupMessage(CHECK_ROOM.channelId, '!مد تشغيل');
                        tempSeconds = 63;
                    } else if (timerLine && !timerLine.includes("غير نشط")) {
                        const h = timerLine.match(/(\d+)س/);
                        const m = timerLine.match(/(\d+)د/);
                        const sMatch = timerLine.match(/(\d+)ث/);

                        if (h) tempSeconds += parseInt(h[1], 10) * 3600;
                        if (m) tempSeconds += parseInt(m[1], 10) * 60;
                        if (sMatch) tempSeconds += parseInt(sMatch[1], 10);
                    } else if (!notReady) {
                        await client.messaging.sendGroupMessage(CHECK_ROOM.channelId, '!مد صندوق ضمان وقت');
                        tempSeconds = 3 * 3600;
                    }

                    globalTimer = tempSeconds;
                    console.log(`[${botName}] ✅ تحديث مؤقت الجهاز الزمني: ${globalTimer} ثانية.`);
                    
                    client.removeListener('groupMessage', handler);
                    clearTimeout(fallbackTimeout);
                    resolve();
                }
            };

            client.on('groupMessage', handler);

            const fallbackTimeout = setTimeout(() => {
                console.log(`[${botName}] ⚠️ لم يتم استلام رد الفحص من المرسل (${CHECK_ROOM.targetUserId}). إعادة المحاولة بعد 63 ثانية...`);
                globalTimer = 63; 
                client.removeListener('groupMessage', handler);
                resolve();
            }, 12000);
        });
    }

    // ================== 🎮 LOOP 1: PLAYING ROOM (دورة غرف اللعب) ==================
    async function playLoop() {
        while (true) {
            try {
                await client.messaging.sendGroupMessage(PLAY_CHANNEL_ID, '!مد مهام');
                await sleep(2000);

                await client.messaging.sendGroupMessage(PLAY_CHANNEL_ID, '!مد تحالف ايداع كل');
                
                // إجمالي الانتظار للدورة هو 63 ثانية (2 ثانية للأمر الأول + 61 ثانية هنا)
                await sleep(61000);
            } catch (e) {
                console.error(`[${botName}] ❌ خطأ في دورة اللعب:`, e.message);
                await sleep(5000);
            }
        }
    }

    // ================== 📦 LOOP 2: FIVE MINUTE OPEN (دورة الفتح الدوري كل 5 دقائق) ==================
    async function openBoxLoop() {
        while (true) {
            try {
                console.log(`[${botName}] 📦 إرسال أمر الفتح الدوري (!مد صندوق فتح) في قناة الفحص...`);
                await client.messaging.sendGroupMessage(CHECK_ROOM.channelId, '!مد صندوق فتح');
                
                // الانتظار لمدة 5 دقائق بالتمام والكمال
                await sleep(300000); 
            } catch (e) {
                console.error(`[${botName}] ❌ خطأ في دورة الفتح الدوري:`, e.message);
                await sleep(5000);
            }
        }
    }

    // ================== ⏱️ LOOP 3: INTELLIGENT CHECK (دورة الفحص الذكي المرتبط بالوقت) ==================
    async function checkLoop() {
        while (true) {
            try {
                // تنفيذ أمر الفحص الأساسي وقراءة الوقت
                await sendBoxCommand();
                
                if (globalTimer > 0) {
                    console.log(`[${botName}] ⏱️ ارتباط ذكي: البوت ينام الآن لـ ${globalTimer} ثانية تزامناً مع الجهاز الزمني...`);
                    await sleep(globalTimer * 1000); // النوم المطابق لوقت الجهاز بالثانية
                } else {
                    console.log(`[${botName}] ⏳ الجهاز الزمني غير نشط. فحص أمان بعد 5 دقائق و 3 ثوانٍ...`);
                    await sleep(303000);
                }
            } catch (e) {
                console.error(`[${botName}] ❌ خطأ في دورة الفحص الذكي:`, e.message);
                await sleep(5000);
            }
        }
    }

    // ================== EVENTS ==================
    client.on('ready', async () => {
        console.log(`✅ الحساب [${botName}] شبك بنجاح! اللعب في [${PLAY_CHANNEL_ID}] | الفحص في [${CHECK_ROOM.channelId}]`);
        
        try {
            // 1. تمديد الوقت عند أول تشغيل في غرفة الفحص
            await client.messaging.sendGroupMessage(CHECK_ROOM.channelId, '!مد صندوق ضمان وقت');
            await sleep(3000);
            
            // 2. تشغيل الـ 3 دورات المتوازية والمستقلة فوراً
            playLoop();
            openBoxLoop();
            checkLoop();

            // 3. 🛑 مؤقت الأمان للإيقاف التلقائي بعد 5 ساعات و 58 دقيقة (21,480,000 مللي ثانية)
            setTimeout(async () => {
                console.log(`[${botName}] 🛑 مضت 5 ساعات و 58 دقيقة! إرسال أمر (!مد ايقاف) في قناة الفحص...`);
                try {
                    await client.messaging.sendGroupMessage(CHECK_ROOM.channelId, '!مد ايقاف');
                } catch (stopErr) {
                    console.error(`[${botName}] خطأ أثناء إرسال أمر الإيقاف:`, stopErr.message);
                }
            }, 21480000);

        } catch (err) {
            console.error(`[${botName}] ❌ خطأ تهيئة البوت:`, err.message);
        }
    });

    client.login(config.email, config.password);
}

// ================== START MULTI ACCOUNTS WITH AUTO-ROUTING ==================
ACCOUNTS.forEach((acc, i) => {
    const playerName = acc.allowedPlayers[0];

    // توجيه غرف اللعب بناءً على اسم اللاعب (رئيسية أو فرعية)
    const roomSettings = specialUsersSet.has(playerName) ? SECOND_ROOM : MAIN_ROOM;

    const finalConfig = {
        ...acc,
        channelId: roomSettings.channelId,
        targetUserId: roomSettings.targetUserId
    };

    // 🌟 التعديل الجديد: تقليص الفاصل الزمني بين دخول الحسابات إلى 15 ثانية بالتمام
    setTimeout(() => {
        createBot(finalConfig);
    }, i * 10000); 
});
