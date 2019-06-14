const io = require('./index');
import UserList from './db/userList';
import SessionList from './db/sessionList';
import OfflineMessage from './db/offlineMessage';

let events = require('events');
let scheduler = new events.EventEmitter();

let msgrQueue = [], ackaQueue = [];

scheduler.on('msgr', (msg)=>{
    console.log('a message came, content:' + msg);
    msgrQueue.push(msg);
    if(msgrQueue.length>0){
        scheduleMsgR();
    }
});

scheduler.on('acka', (msg)=>{
    ackaQueue.push(msg);
    if(ackaQueue.length>0){
        scheduleAckA();
    }
    console.log('a ack from client came');
});


async function scheduleMsgR(){
    while(msgrQueue.length!==0){
        let msg = msgrQueue.pop();
        await handleMsg(msg);
    }
};

async function scheduleAckA(){
    while(ackaQueue.length!==0){
        let msg = msgrQueue.pop();
        await handleMsg(msg);
    }
}

function addOneOfflineMsg(msg, callback){
    OfflineMessage.create({
        token: msg.token,
        msgBody: msg,
        msgId: 0
    }, callback);
}

module.exports = scheduler;