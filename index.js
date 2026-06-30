import 'dotenv/config';
import wolfjs from 'wolf.js';

const { WOLF } = wolfjs;

// ================== 🎛️ CONTROL PANEL (المتحكم الرئيسي) ==================

// 1. الإعدادات الرئيسية الافتراضية للعب (الغرفة الرئيسية)
const MAIN_ROOM = {
    channelId: 569,
    targetUserId: 84520028  // مرسل الكابتشا الرئيسي للعب
};

// 2. إعدادات الغرفة الفرعية/الثانية للعب
const SECOND_ROOM = {
     channelId: 13219769,
     targetUserId: 76023171  // مرسل الكابتشا الثاني للعب
};

// 3. 🎯 قنوات وغرفة فحص الصناديق الجديدة
const CHECK_ROOM = {
    channelId: 18654218,     // رقم قناة الفحص الخاصة بك
    targetUserId: 76023242   // معرف حساب اللعبة (المرسل) في قناة الفحص
};

// 4. أسماء الحسابات التي تريد نقلها للغرفة الثانية في اللعب
const SPECIAL_ROOM_USERS = [];
const specialUsersSet = new Set(SPECIAL_ROOM_USERS);

// =========================================================================

// ================== ACCOUNTS LIST (مصفوفة الحسابات والأوامر الخاصة بها) ==================
const ACCOUNTS = [
    { email: process.env.U_MAIL_1,  password: process.env.U_PASS_1,  allowedPlayers: ['King'],    cmd: '!مد تحالف ايداع كل' },
    { email: process.env.U_MAIL_2,  password: process.env.U_PASS_2,  allowedPlayers: ['KSA'],     cmd: '!مد تحالف ايداع كل' },
    { email: process.env.U_MAIL_3,  password: process.env.U_PASS_3,  allowedPlayers: ['MKH'],     cmd: '!مد تحالف ايداع كل' },
    { email: process.env.U_MAIL_4,  password: process.env.U_PASS_4,  allowedPlayers: ['SAA'],     cmd: '!مد تحالف ايداع كل' },
    { email: process.env.U_MAIL_5,  password: process.env.U_PASS_5,  allowedPlayers: ['JDH'],     cmd: '!مد تحالف ايداع كل' },
    { email: process.env.U_MAIL_6,  password: process.env.U_PASS_6,  allowedPlayers: ['MLK'],     cmd: '!مد تحالف ايداع كل' }, 
    { email: process.env.U_MAIL_7,  password: process.env.U_PASS_7,  allowedPlayers: ['CRN'],     cmd: '!مد تحالف ايداع كل' },
    { email: process.env.U_MAIL_8,  password: process.env.U_PASS_8,  allowedPlayers: ['REX'],     cmd: '!مد تحالف ايداع كل' },
    { email: process.env.U_MAIL_9,  password: process.env.U_PASS_9,  allowedPlayers: ['LRD'],     cmd: '!مد تحالف ايداع كل' },
    { email: process.env.U_MAIL_10, password: process.env.U_PASS_10, allowedPlayers: ['ROY'],     cmd: '!مد تحالف ايداع كل' },
    { email: process.env.U_MAIL_11, password: process.env.U_PASS_11, allowedPlayers: ['EMP'],     cmd: '!مد تحالف ايداع كل' },
    { email: process.env.U_MAIL_12, password: process.env.U_PASS_12, allowedPlayers: ['NOR'],     cmd: '!مد تحالف ايداع كل' },
    { email: process.env.U_MAIL_13, password: process.env.U_PASS_13, allowedPlayers: ['Passion'], cmd: '!مد تحالف ايداع كل' }
];

// دالة الانتظار الموحدة
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ================== BOT FACTORY ==================
function createBot(config) {
    const client = new WOLF();
    const PLAY_CHANNEL_ID = config.channelId; 
    const botName = config.allowedPlayers[0];  
    const playCommand = config.cmd; 
    
    let globalTimer = 0;  
    let isTimeDeviceActive = false; 

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

    // ================== BOX CHECK WITH RETRY & ADVANCED STATE LOGIC ==================
    async function sendBoxCommand(attempt = 1) {
        return new Promise((resolve) => {
            console.log(`[${botName}] 🔍 [محاولة ${attempt}] جاري إرسال أمر (!مد صندوق) وفحص الحالات...`);
            client.messaging.sendGroupMessage(CHECK_ROOM.channelId, '!مد صندوق');

            let isResolved = false;

            const handler = async (message) => {
                if (
                    message.sourceSubscriberId === CHECK_ROOM.targetUserId &&
                    message.targetGroupId === CHECK_ROOM.channelId &&
                    typeof message.body === 'string' &&
                    message.body.startsWith('/me 📦 حالة الصناديق')
                ) {
                    isResolved = true;
                    client.removeListener('groupMessage', handler);
                    clearTimeout(fallbackTimeout);

                    // 🌟 تنظيف النص بالكامل من علامات الاتجاه والحروف المخفية لضمان المطابقة الصارمة
                    const cleanBody = message.body.replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E]/g, '');
                    const lines = cleanBody.split('\n');
                    
                    // عزل سطر الضمان الفعلي (الذي لا يحتوي على نقاط) والتحقق من جاهزيته
                    const guaranteeLine = lines.find(l => l.includes('الضمان') && !l.includes('نقاط'));
                    const isGuaranteeReady = guaranteeLine ? guaranteeLine.includes('جاهز') : false;
                    const notReady = !isGuaranteeReady; 

                    const boxes = cleanBody.match(/برونزي:\s*(\d+)\s*\|\s*فضي:\s*(\d+)\s*\|\s*ذهبي:\s*(\d+)/);
                    const pointsMatch = cleanBody.match(/نقاط الضمان:\s*(\d+)\/50/);

                    const g = boxes ? parseInt(boxes[3], 10) : 0;
                    const s = boxes ? parseInt(boxes[2], 10) : 0;
                    const b = boxes ? parseInt(boxes[1], 10) : 0;
                    const p = pointsMatch ? parseInt(pointsMatch[1], 10) : 0;

                    await processBox(g, s, b, p, notReady);

                    const timerLine = lines.find(l => l.includes('الجهاز الزمني'));
                    let tempSeconds = 0;

                    if (timerLine) {
                        if (timerLine.includes('غير نشط')) {
                            if (isGuaranteeReady) {
                                // 🟢 [الحالة الأولى]: غير نشط وحالة الضمان جاهز -> تفعيل فوري لـ 3 ساعات ونوم ممتد
                                console.log(`[${botName}] 🎯 [الحالة 1] الجهاز غير نشط والضمان جاهز! تفعيل ضمان الوقت لـ 3 ساعات...`);
                                await client.messaging.sendGroupMessage(CHECK_ROOM.channelId, '!مد صندوق ضمان وقت');
                                tempSeconds = (3 * 3600) + 60; // 3 ساعات ودقيقة واحدة (10860 ثانية) بدون فحص صندوق
                                isTimeDeviceActive = true;
                            } else {
                                // 🟡 [الحالة الثانية]: غير نشط والضمان غير جاهز -> لعب آمن وإعادة فحص كل 10 دقائق
                                console.log(`[${botName}] ⏳ [الحالة 2] الجهاز غير نشط والضمان غير جاهز. لعب آمن وفحص بعد 10 دقائق...`);
                                tempSeconds = 600; // 10 دقائق (600 ثانية) لإعادة الفحص الدوري
                                isTimeDeviceActive = false;
                            }
                        } else if (timerLine.includes('موقوف')) {
                            // 🔵 [الحالة الثالثة]: الجهاز موقوف -> تشغيل فوري وقراءة الوقت المتبقي إن وجد
                            console.log(`[${botName}] 🎛️ [الحالة 3] الجهاز الزمني موقوف! إرسال أمر (!مد تشغيل)...`);
                            await client.messaging.sendGroupMessage(CHECK_ROOM.channelId, '!مد تشغيل');
                            
                            const h = timerLine.match(/(\d+)س/);
                            const m = timerLine.match(/(\d+)د/);
                            const sMatch = timerLine.match(/(\d+)ث/);

                            if (h) tempSeconds += parseInt(h[1], 10) * 3600;
                            if (m) tempSeconds += parseInt(m[1], 10) * 60;
                            if (sMatch) tempSeconds += parseInt(sMatch[1], 10);
                            
                            tempSeconds = tempSeconds > 0 ? tempSeconds + 60 : 63; // إضافة دقيقة أمان أو فحص سريع
                            isTimeDeviceActive = true;
                        } else {
                            // 🟣 [حالة إضافية]: الجهاز يعمل ونشط بالفعل -> قراءة التوقيت التنازلي الطبيعي المتبقي
                            const h = timerLine.match(/(\d+)س/);
                            const m = timerLine.match(/(\d+)د/);
                            const sMatch = timerLine.match(/(\d+)ث/);

                            if (h) tempSeconds += parseInt(h[1], 10) * 3600;
                            if (m) tempSeconds += parseInt(m[1], 10) * 60;
                            if (sMatch) tempSeconds += parseInt(sMatch[1], 10);
                            
                            tempSeconds += 60; // إضافة دقيقة أمان فوق التوقيت
                            isTimeDeviceActive = true;
                        }
                    }

                    globalTimer = tempSeconds;
                    console.log(`[${botName}] ⏱️ معالجة الحالة تمت بنجاح -> نشط للعب: ${isTimeDeviceActive} | المؤقت القادم للفحص: ${globalTimer} ثانية.`);
                    resolve();
                }
            };

            client.on('groupMessage', handler);

            const fallbackTimeout = setTimeout(async () => {
                if (isResolved) return;
                client.removeListener('groupMessage', handler);

                if (attempt < 3) {
                    console.log(`[${botName}] ⚠️ تعليق في سيرفر اللعبة! لم يتم استلام رد الفحص (المحاولة ${attempt}). إعادة المحاولة بعد 4 ثوانٍ...`);
                    await sleep(4000);
                    resolve(await sendBoxCommand(attempt + 1)); 
                } else {
                    console.log(`[${botName}] 🚨 فشلت 3 محاولات فحص بسبب تعليق اللعبة! فرض وضع الأمان التلقائي المؤقت (63 ثانية)...`);
                    globalTimer = 63; 
                    isTimeDeviceActive = true; 
                    resolve();
                }
            }, 12000);
        });
    }

    // ================== 🎮 LOOP 1: PLAYING ROOM (دورة غرف اللعب التلقائية) ==================
    async function playLoop() {
        while (true) {
            try {
                await client.messaging.sendGroupMessage(PLAY_CHANNEL_ID, '!مد مهام');
                await sleep(2000);

                await client.messaging.sendGroupMessage(PLAY_CHANNEL_ID, playCommand);
                
                if (isTimeDeviceActive) {
                    await sleep(61000); // الوضع السريع التزامني المعتاد (كل 63 ثانية إجمالاً)
                } else {
                    // 🎯 تطبيق التوقيت المطلق للحالة الثانية: كل 5 دقائق و3 ثوانٍ بالتمام (2000 + 301000 = 303000ms)
                    console.log(`[${botName}] ⚠️ الجهاز الزمني غير نشط! وضع الأمان لدورة اللعب (كل 5 دقائق و 3 ثوانٍ)...`);
                    await sleep(301000); 
                }
            } catch (e) {
                console.error(`[${botName}] ❌ خطأ في دورة اللعب:`, e.message);
                await sleep(5000);
            }
        }
    }

    // ================== 📦 LOOP 2: FIVE MINUTE OPEN (دورة الففتح الدوري كل 5 دقائق) ==================
    async function openBoxLoop() {
        while (true) {
            try {
                console.log(`[${botName}] 📦 إرسال أمر الفتح الدوري (!مد صندوق فتح) في قناة الفحص...`);
                await client.messaging.sendGroupMessage(CHECK_ROOM.channelId, '!مد صندوق فتح');
                await sleep(300000); 
            } catch (e) {
                console.error(`[${botName}] ❌ خطأ في دورة الفتح الدوري:`, e.message);
                await sleep(5000);
            }
        }
    }

    // ================== ⏱️ LOOP 3: INTELLIGENT CHECK (دورة الفحص الدوري المنظم) ==================
    async function checkLoop() {
        while (true) {
            try {
                if (globalTimer > 0) {
                    console.log(`[${botName}] ⏱️ ارتباط ذكي: البوت ينام لـ ${globalTimer} ثانية تزامناً مع انتهاء حالة الفحص السابقة...`);
                    await sleep(globalTimer * 1000); 
                } else {
                    await sleep(600000); // احتياطي أمان 10 دقائق إذا صفر المؤقت لأي سبب
                }
                
                await sendBoxCommand();

            } catch (e) {
                console.error(`[${botName}] ❌ خطأ في دورة الفحص:`, e.message);
                await sleep(5000);
            }
        }
    }

    // ================== 🥷 LOOP 4: STEAL LOOP (دورة السرقة التلقائية كل 3 دقائق و 3 ثواني) ==================
    async function stealLoop() {
        while (true) {
            try {
                console.log(`[${botName}] 🥷 إرسال أمر السرقة التلقائي (!مد اسرق) في غرفة اللعب...`);
                await client.messaging.sendGroupMessage(PLAY_CHANNEL_ID, '!مد اسرق');
                await sleep(183000); // 3 دقائق و 3 ثوانٍ بالتمام والكمال (183 ثانية)
            } catch (e) {
                console.error(`[${botName}] ❌ خطأ في دورة السرقة:`, e.message);
                await sleep(5000);
            }
        }
    }

    // ================== EVENTS (تسلسل أوامر التشغيل بالتتابع الصارم) ==================
    client.on('ready', async () => {
        console.log(`✅ الحساب [${botName}] شبك بنجاح! اللعب في [${PLAY_CHANNEL_ID}] | الفحص في
