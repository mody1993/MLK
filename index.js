import 'dotenv/config';
import wolfjs from 'wolf.js';

const { WOLF } = wolfjs;

// ================== 🎛️ CONTROL PANEL (المتحكم الرئيسي) ==================

const MAIN_ROOM = {
    channelId: 569,
    targetUserId: 84520028
};

const SECOND_ROOM = {
     channelId: 13219769,
     targetUserId: 76023171
};

const SPECIAL_ROOM_USERS = [];

// ================== ACCOUNTS LIST ==================
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

// ================== BOT FACTORY ==================
function createBot(config) {
    const client = new WOLF();
    const CHANNEL_ID = config.channelId;
    const TARGET_USER_ID = config.targetUserId;
    
    let globalTimer = 63; 

    async function processBox(g, s, b, points, notReady) {
        const send = async (cmd) => {
            await client.messaging.sendGroupMessage(CHANNEL_ID, cmd);
            await new Promise(r => setTimeout(r, 2000)); 
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

    async function sendBoxCommand() {
        return new Promise((resolve) => {
            console.log(`[${config.allowedPlayers[0]}] 🔍 فحص الصناديق من المرسل (${TARGET_USER_ID})...`);
            client.messaging.sendGroupMessage(CHANNEL_ID, '!مد صندوق');

            const handler = async (message) => {
                if (
                    message.sourceSubscriberId === TARGET_USER_ID &&
                    message.targetGroupId === CHANNEL_ID &&
                    typeof message.body === 'string' &&
                    message.body.startsWith('/me 📦 حالة الصناديق')
                ) {
                    const body = message.body;
                    const notReady = body.includes("غير جاهز");

                    const boxes = body.match(/برونزي:\s*(\d+)\s*\|\s*فضي:\s*(\d+)\s*\|\s*ذهبي:\s*(\d+)/);
                    const points = body.match(/نقاط الضمان:\s*(\d+)\/50/);

                    const g = boxes ? +boxes[3] : 0;
                    const s = boxes ? +boxes[2] : 0;
                    const b = boxes ? +boxes[1] : 0;
                    const p = points ? +points[1] : 0;

                    await processBox(g, s, b, p, notReady);

                    const timerLine = body.split('\n').find(l => l.includes('الجهاز الزمني'));
                    let tempSeconds = 0;

                    if (timerLine?.includes('موقوف')) {
                        await client.messaging.sendGroupMessage(CHANNEL_ID, '!مد تشغيل');
                        tempSeconds = 63;
                    } else if (timerLine && !timerLine.includes("غير نشط")) {
                        const h = timerLine.match(/(\d+)س/);
                        const m = timerLine.match(/(\d+)د/);
                        const sMatch = timerLine.match(/(\d+)ث/);

                        if (h) tempSeconds += +h[1] * 3600;
                        if (m) tempSeconds += +m[1] * 60;
                        if (sMatch) tempSeconds += +sMatch[1];
                    } else if (!notReady) {
                        await client.messaging.sendGroupMessage(CHANNEL_ID, '!مد صندوق ضمان وقت');
                        tempSeconds = 3 * 3600;
                    }

                    globalTimer = tempSeconds;
                    console.log(`[${config.allowedPlayers[0]}] ✅ تحديث المؤقت: ${globalTimer} ثانية.`);
                    
                    client.removeListener('groupMessage', handler);
                    clearTimeout(fallbackTimeout);
                    resolve();
                }
            };

            client.on('groupMessage', handler);

            const fallbackTimeout = setTimeout(() => {
                console.log(`[${config.allowedPlayers[0]}] ⚠️ لم يتم استلام رد من المرسل (${TARGET_USER_ID}). تفعيل مؤقت الأمان (63 ثانية)...`);
                globalTimer = 63; 
                client.removeListener('groupMessage', handler);
                resolve();
            }, 12000);
        });
    }

    async function loop() {
        while (true) {
            try {
                await client.messaging.sendGroupMessage(CHANNEL_ID, '!مد مهام');
                await new Promise(r => setTimeout(r, 2000));

                // تعديل: الحساب السادس يرسل أمر الهدية بدلاً من أمر إيداع التحالف
                if (config.email === process.env.U_MAIL_6) {
                    await client.messaging.sendGroupMessage(CHANNEL_ID, '!مد هدية 38770375 كل');
                } else {
                    await client.messaging.sendGroupMessage(CHANNEL_ID, '!مد تحالف ايداع كل');
                }
                await new Promise(r => setTimeout(r, 2000));

                await client.messaging.sendGroupMessage(CHANNEL_ID, '!مد صندوق فتح');
                await new Promise(r => setTimeout(r, 2000));

                if (globalTimer > 0) {
                    globalTimer = Math.max(0, globalTimer - 63);
                    console.log(`[${config.allowedPlayers[0]}] ⏳ انتظار 63 ثانية...`);
                    await new Promise(r => setTimeout(r, 63000));
                } else {
                    console.log(`[${config.allowedPlayers[0]}] ⏳ انتظار 5 دقائق و 3 ثوانٍ...`);
                    await new Promise(r => setTimeout(r, 303000));
                    await sendBoxCommand();
                }

            } catch (e) {
                console.error(`[${config.allowedPlayers[0]}] خطأ في الدورة:`, e.message);
                await new Promise(r => setTimeout(r, 5000));
            }
        }
    }

    client.on('ready', async () => {
        console.log(`✅ الحساب [${config.allowedPlayers[0]}] شبك بنجاح في الغرفة [${CHANNEL_ID}] مع المرسل [${TARGET_USER_ID}]`);
        
        try {
            await client.messaging.sendGroupMessage(CHANNEL_ID, '!مد صندوق ضمان وقت');
            await new Promise(r => setTimeout(r, 3000));
            await sendBoxCommand();
            loop();
        } catch (err) {
            console.error(`[${config.allowedPlayers[0]}] خطأ تهيئة:`, err.message);
        }
    });

    client.login(config.email, config.password);
}

ACCOUNTS.forEach((acc, i) => {
    const playerName = acc.allowedPlayers[0];
    const roomSettings = SPECIAL_ROOM_USERS.includes(playerName) ? SECOND_ROOM : MAIN_ROOM;

    const finalConfig = {
        ...acc,
        channelId: roomSettings.channelId,
        targetUserId: roomSettings.targetUserId
    };

    setTimeout(() => {
        createBot(finalConfig);
    }, i * 35000); 
});
