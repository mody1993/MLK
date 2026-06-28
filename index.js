import 'dotenv/config';
import wolfjs from 'wolf.js';

const { WOLF } = wolfjs;

// ================== 🎛️ CONTROL PANEL ==================
const MAIN_ROOM = { channelId: 569, targetUserId: 84520028 };
const SECOND_ROOM = { channelId: 13219769, targetUserId: 76023171 };
const SPECIAL_ROOM_USERS = []; 

const ACCOUNTS = [
    { email: process.env.U_MAIL_1, password: process.env.U_PASS_1, allowedPlayers: ['King'] },
    { email: process.env.U_MAIL_2, password: process.env.U_PASS_2, allowedPlayers: ['KSA'] },
    { email: process.env.U_MAIL_3, password: process.env.U_PASS_3, allowedPlayers: ['MKH'] },
    { email: process.env.U_MAIL_4, password: process.env.U_PASS_4, allowedPlayers: ['SAA'] },
    { email: process.env.U_MAIL_5, password: process.env.U_PASS_5, allowedPlayers: ['JDH'] },
    { email: process.env.U_MAIL_6, password: process.env.U_PASS_6, allowedPlayers: ['MLK'] },
    { email: process.env.U_MAIL_7, password: process.env.U_PASS_7, allowedPlayers: ['CRN'] },
    { email: process.env.U_MAIL_8, password: process.env.U_PASS_8, allowedPlayers: ['REX'] },
    { email: process.env.U_MAIL_9, password: process.env.U_PASS_9, allowedPlayers: ['LRD'] },
    { email: process.env.U_MAIL_10, password: process.env.U_PASS_10, allowedPlayers: ['ROY'] },
    { email: process.env.U_MAIL_11, password: process.env.U_PASS_11, allowedPlayers: ['EMP'] },
    { email: process.env.U_MAIL_12, password: process.env.U_PASS_12, allowedPlayers: ['NOR'] },
    { email: process.env.U_MAIL_13, password: process.env.U_PASS_13, allowedPlayers: ['Passion'] }
];

const activeBots = [];

function createBot(config) {
    const client = new WOLF();
    const { channelId, targetUserId, email, allowedPlayers } = config;
    const name = allowedPlayers[0];
    
    let taskInterval = null;
    let currentFrequency = 300000; // يبدأ بـ 5 دقائق

    async function send(cmd) {
        await client.messaging.sendGroupMessage(channelId, cmd);
        await new Promise(r => setTimeout(r, 2000));
    }

    async function runTasks() {
        await send('!مد مهام');
        await send(email === process.env.U_MAIL_6 ? '!مد هدية 38770375 كل' : '!مد تحالف ايداع كل');
    }

    client.on('groupMessage', async (msg) => {
        if (msg.sourceSubscriberId === targetUserId && msg.targetGroupId === channelId && msg.body?.startsWith('/me 📦 حالة الصناديق')) {
            const body = msg.body;
            const hasTimer = !body.includes('غير نشط');
            const isStopped = body.includes('موقوف');

            // إذا كان موقوفاً، نشغله
            if (isStopped) await send('!مد تشغيل');
            // إذا غير نشط وغير جاهز، نطلب ضمان الوقت
            else if (body.includes('غير نشط') && body.includes('غير جاهز')) await send('!مد صندوق ضمان وقت');

            // تحديث التردد (دقيقة إذا كان يعمل، 5 دقائق إذا لا)
            const newFreq = hasTimer ? 60000 : 300000;
            if (newFreq !== currentFrequency) {
                currentFrequency = newFreq;
                if (taskInterval) clearInterval(taskInterval);
                taskInterval = setInterval(runTasks, currentFrequency);
            }
        }
    });

    client.on('ready', async () => {
        console.log(`✅ ${name} متصل ويبدأ الدورة الخاصة...`);
        
        // دورة الإقلاع الفوري: فحص وتشغيل
        await send('!مد صندوق');
        await runTasks();
        
        // تشغيل دورة الصناديق المستقلة
        setInterval(async () => await send('!مد صندوق فتح'), 300000);
        setInterval(async () => await send('!مد صندوق'), 300000); // فحص دوري
        
        taskInterval = setInterval(runTasks, currentFrequency);
    });

    client.login(config.email, config.password);
    activeBots.push({ client, channelId });
}

// إغلاق آمن
setTimeout(() => {
    activeBots.forEach(b => b.client.messaging.sendGroupMessage(b.channelId, '!مد ايقاف'));
    setTimeout(() => process.exit(0), 120000);
}, (358 * 60 * 1000) - 120000);

ACCOUNTS.forEach((acc, i) => {
    const room = SPECIAL_ROOM_USERS.includes(acc.allowedPlayers[0]) ? SECOND_ROOM : MAIN_ROOM;
    setTimeout(() => createBot({ ...acc, ...room }), i * 10000);
});
