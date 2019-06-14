const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const uuid = require('uuid')
const querystring = require('querystring')

import UserList from './db/userList';
import SessionList from './db/sessionList';
import OfflineMessage from './db/offlineMessage'
import DialogRecord from './db/dialogRecord';
import MsgId from './db/msgId'
import offlineMessage from './db/offlineMessage';

io.on('connection', (socket)=>{
    let userId = uuid.v1();
    socket.emit('allocUserId', userId);
    socket.on('allocUserId', (oldUserId, newUserId)=>{
        if(oldUserId!==newUserId){ // 已登录重连
            UserList.findOneAndUpdate({userId: oldUserId},{
                socketId: socket.id,
                onlineStatus: true
            }, (err,user)=>{
                // 拉取所有会话的离线消息
                if(err===null && user!==null){
                    let sessionIdList = user.sessionIdList;
                    SessionList.find({sessionId:{'$in': sessionIdList}}, 'token userIdList',(err, tokens)=>{
                    if(err===null && tokens!==null){
                        tokens = tokens.map((x)=>{return x.token})
                        OfflineMessage.find({token: {'$in': tokens}, 
                        sendTime:{'$gt':user.lastOnlineTime}, 
                        userId:{'$ne': user.userId}})
                        .exec((err, msgs)=>{
                            if(err===null && msgs!==null)
                                socket.emit('pushOfflineMsg', msgs);
                        });
                    }
                });   
                }             
            });
        }
        // 首次登录
        else{
            console.log(oldUserId, newUserId);
            UserList.create({
                userId: newUserId,
                socketId: socket.id
            }, (err)=>{
                if(err!==null) console.log(`创建用户时出现问题`)
            });
        }
    });

    socket.on('addSession', (userId, token) => {
        console.log('the client launch a connect request' + '\n' + token);
        // 对方已加入聊天室
        SessionList.findOne({token: token},(err,session)=>{
            // 还未建立会话
            if(err===null && session===null){
                initSession(userId, token, (sessionId)=>{
                    socket.emit('addSession', {
                        hashToken: token, 
                        sessionId: sessionId, 
                        peerStatus: false
                    });
                    DialogRecord.create({
                        sessionId: sessionId,
                        token: token,
                        establishedTime: new Date(),
                        closedTime: null
                    });
                    OfflineMessage.find({token: token}, (err,msgs)=>{
                        if(err===null && msgs!==null){
                            socket.emit('pushOfflineMsg', msgs);
                        }
                    });
                });
            }
            // 对方已加入了会话
            else if(session.userIdList.length===1){
                let peerUserId = session.userIdList[0];
                UserList.findOne({userId: peerUserId},(err,user)=>{
                    if(err===null && user!==null){
                        joinSession(userId, session.sessionId, ()=>{
                            // 对方在线
                            socket.emit('addSession', {
                                hashToken: token, 
                                sessionId: session.sessionId, 
                                peerStatus: true
                            });
                            DialogRecord.findOne({sessionId: session.sessionId, closedTime: null}, 'establishedTime', (err, doc)=>{
                                if(err===null && doc!==null){
                                    OfflineMessage.find({token: token}, (err,msgs)=>{
                                        if(err===null && msgs!==null){
                                            let before = [];let after = [];
                                            for(let msg of msgs){
                                                if(msg.sendTime > doc.establishedTime) {
                                                    after.push(msg);
                                                }
                                                else {before.push(msg); }
                                            }
                                            if(before!==[]) socket.emit('pushOfflineMsg', before);
                                            for(let msg of after){
                                                socket.emit('msgn', msg);
                                            }
                                            OfflineMessage.deleteMany({token: token, sendTime:{'$gt': doc.establishedTime}}, (err)=>
                                            {if(err!==null) console.log('批量删除离线消息出现错误')});
                                        }
                                    });
                                }
                            });
                            if(err===null && user!==null && user.onlineStatus){
                                notifyPeerStatus(peerUserId, session.sessionId, true);
                            }
                        }); 
                    }
                });
            }
            // 有多人加入了会话
            else{
                console.log('多人加入了会话');
                UserList.find({userId:{'$in': session.userIdList}},(err,users)=>{
                    if(!err){
                        // 向该会话内的所有用户发送警告
                        let warners = users.map((x)=>{return x.socketId});
                        for(let warn in warners){
                            io.to(`${warn}`).emit('loginWarning', token);
                        }
                        socket.emit('loginWarning', token);
                    }
                });
            }
        });
    });

    socket.on('logoutSession',(userId, sessionId)=>{
        leaveSession(userId, sessionId);
    })

    socket.on('logoutUser', (userId)=>{
        removeUser(userId);
    });

    socket.on('getDialogRecords', (tokens)=>{
        getDialogRecords(tokens, (records)=>{
            socket.emit('getDialogRecords', records);
        });
    });

    socket.on('removeDialogRecord', (sessionId)=>{
        removeDialogRecord(sessionId);
    })

    // socket.on('removeOfflineMsg',(msgIdList)=>{
    //     OfflineMessage.deleteMany({msgId: {'$in': msgIdList}},(err)=>{
    //         if(!err){}
    //         else{
    //             console.log(`error occurs when deleting offline message: ${err}`);
    //         }
    //     });
    // });

    socket.on('msgr', (msg, ack)=>{
        handleMsg(msg, ack);
    });

    socket.on('ackr', (msg, acka)=>{
        acka(msg);
        UserList.findOne({userId: msg.userId}, 'socketId',(err, user)=>{
            if(err===null && user!==null){
                io.to(`${user.socketId}`).emit('ackn', {
                    sessionId: msg.sessionId,
                    msgId: msg.msgId
                });
            }
        });
    });

    socket.on('disconnect', (reason)=>{
        console.log(reason);
        switch(reason){
            // 用户关闭了窗口   
            case 'transport close':
                socket.disconnect(true);
                UserList.findOne({socketId: socket.id}, 'userId',(err, user)=>{
                    if(err===null && user!==null){
                        removeUser(user.userId);
                    }
                });
            break;

            // 用户网络超时
            case 'ping timeout':
                UserList.updateOne({socketId: socket.id}, {
                    onlineStatus: false,
                    lastOnlineTime: new Date()
                });
            break;
        }
        console.log('a user left'); 
    });

    socket.on('removeOfflineMsg', (x)=>{
        removeOfflineMsg(x.ids); 
    });

    socket.on('error', (error)=>{
        console.log(`有错误发生${error}`);
    });

    /**
     * 当用户请求建立一个会话,且该会话没有其他
     * 用户时,执行此方法.
     * @param {String} userId 
     * @param {String} token 
     */
    function initSession(userId, token, callback){
        let sessionId = uuid.v1();
        SessionList.create({
            sessionId: sessionId,
            userIdList: [userId],
            token: token
        },(err)=>{
            if(err===null){
                UserList.updateOne({userId: userId},{'$push':{
                    sessionIdList: sessionId
                }}, ()=>{callback(sessionId)});
            }
        });
    }

    /**
     * 
     */
    function joinSession(userId, sessionId, callback){
        SessionList.updateOne({sessionId: sessionId},{
            '$push': {userIdList: userId}
        },(err)=>{
            if(err===null){
                UserList.updateOne({userId: userId},{'$push':{
                    sessionIdList: sessionId
                }},callback);
            }
        })
    }

    function leaveSession(userId, sessionId, callback){
        SessionList.findOne({sessionId: sessionId}, (err,session)=>{
            if(err===null && session!==null){
                if(session.userIdList.length > 1){
                    SessionList.findOneAndUpdate(
                        {sessionId: sessionId},
                        {'$pull':{userIdList: userId}}, 
                        {new: true, fields: 'userIdList'}, 
                        (err, doc)=>{
                            if(err===null && doc!==null &&doc.userIdList.length===1) {
                                notifyPeerStatus(doc.userIdList[0], sessionId, false);
                        }
                    });
                }
                else{
                    writeDialogRecord(sessionId, new Date(), ()=>{
                        console.log('写完记录');
                        SessionList.deleteOne({sessionId: sessionId}, (err)=>{if(err===null) {
                            console.log('删除万记录');
                            OfflineMessage.findOne({token: session.token, type: {'$in': ['file', 'image']}}, (err, doc)=>{
                                if(err===null && doc===null){
                                    notfiyFSRemoveUserFile(session.token);
                                }
                            })
                        }});
                    })
                }
                UserList.updateOne({userId: userId}, {
                    '$pull':{sessionIdList: sessionId}
                }, callback);
            }
        })
    }
    
    /**
     * 告知某用户某会话的对端用户的在线状态
     * @param {*} userId 
     * @param {*} sessionId 
     */
    
    function notifyPeerStatus(userId, sessionId, status){
        UserList.findOne({userId: userId},'onlineStatus socketId', (err,user)=>{
            if(err===null && user!==null){
                if(user.onlineStatus){
                    io.to(`${user.socketId}`).emit('peerStatus',{
                        sessionId: sessionId, 
                        status: status
                    });
                }
            }
        });
    }

    function removeUser(userId){
        UserList.findOne({userId: userId}, 'sessionIdList', (err, user)=>{
            if(err===null && user!==null){
                for(let sessionId of user.sessionIdList){
                    leaveSession(userId, sessionId);
                }
                UserList.deleteOne({userId: userId}, (err)=>{if(err)console.log('删除用户时出现问题')})
            }
        });
    }

    function removeOfflineMsg(msgIds){
        OfflineMessage.find({msgId: {'$in': msgIds}, type:{'$in':['file','image']}}, 'content', (err, msgs)=>{
            // 
            if(err===null && msgs!==null){
                let urls = msgs.map((x)=> x.content.url);
                let options = {
                    host: 'localhost',
                    port: 3008,
                    path: '/removeOfflineFiles',
                    method: 'POST',
                    headers:{
                        'Content-Type': 'application/x-www-form-urlencoded',
                    }
                }
                let req = require('http').request(options, (res)=>{
                    console.log(`删除离线文件的状态码 :${res.statusCode}`);
                })
                req.write(querystring.stringify({urls: urls}));
                req.end();           
            }
            offlineMessage.deleteMany({msgId: {'$in': msgIds}}, (err)=>{
                if(err!==null){
                    console.log(`error occurs during deleting offline messages:${msgId}`);
                }
            });
        })
    }

    function generateMsgId(callback){
        // 也可创建一个变量以读取msgId,读写该变量,只写数据库
        MsgId.findOne({idName: 'gMsgId'}, 'value', (err, id)=>{
            if(err===null && id!==null){
                MsgId.updateOne({idName: 'gMsgId'},{value: id.value + 1}, ()=>{callback(id.value)});
            }
        })
    }

    /**
     * 在离线记录中填入终止时间
     * @param {String} userId
     */
    function writeDialogRecord(sessionId, time, callback){
        SessionList.findOne({sessionId: sessionId}, 'token',(err, session)=>{
            if(err===null){
                if (session!==null){
                    console.log('开始更新记录');
                    DialogRecord.updateOne({token: session.token, closedTime: null}, {closedTime: time}, (err)=>{
                        if(err===null) callback();
                    });
                }
                else
                    console.log('录入对话记录时出现问题，没有找到指定用户');
            }
        });
    }

    /**
     * 添加一条离线消息
     * @param {*} msg 
     * @param {*} callback 
     */
    function addOneOfflineMsg(msg, callback){
        /*if(msg.type==='voice'){
            if(msg.content){
                let h = 'data:audio/mp3;base64,';
                let buffer = Buffer.alloc(h.length + msg.content.length);
                buffer.write(h);
                msg.content.copy(buffer, h.length, 0, msg.content.length);
                msg.content = buffer;
            }
        }*/
        generateMsgId((msgId)=>{
            msg.sendTime = new Date();
            msg.msgId = msgId;
            OfflineMessage.create(msg, ()=>{callback(msgId)});
        })
    }

    function notfiyFSRemoveUserFile(token){
        let options = {
            host: 'localhost',
            port: 3008,
            path: '/removeUserFiles/' + token,
            method: 'DELETE'
        }
        let req = require('http').request(options, (res)=>{
            console.log(`删除用户文件的状态码 :${res.statusCode}`);
        })
        req.end();
    }

    function getDialogRecords(tokens, callback){
        DialogRecord.find({token: {'$in': tokens}}, (err, records)=>{
            if(err===null && records!==null){
                callback(records);
            }
        })
    }

    function removeDialogRecord(sessionId){   
        DialogRecord.deleteOne({sessionId: sessionId}, (err)=>{
            if(err!==null){
                console.log(`error occours during deleting record:${err}`);
            }
        });
    }

    /**
     * 处理消息发送的主要逻辑
     * @param {*} ack 
     */
    function handleMsg(msg, ack){
        let userId = msg.userId;
        let sessionId = msg.sessionId;
        SessionList.findOne({sessionId: sessionId}, 'userIdList', (err, session)=>{
            if(err===null && session!==null){
                let receipt = {
                    sessionId: sessionId,
                    msgCount: msg.msgCount
                }
                if(session){
                    let userIdList = session.userIdList;
                    userIdList = userIdList.filter((x)=> x!==userId);
                    if(userIdList.length!==0){
                        UserList.findOne({userId: userIdList[0]},(err, user)=>{
                            if(err===null && user!==null){
                                // 如果对端在线
                                if(user.onlineStatus){
                                    generateMsgId((msgId)=>{
                                        receipt.msgId = msgId;
                                        receipt.peerStatus = true;
                                        msg.msgId = msgId;
                                        io.to(`${user.socketId}`).emit('msgn', msg);
                                        ack(receipt); // msga
                                    });
                                }
                                // 对端不在线
                                else{ 
                                    console.log('对方已离线,已转离线消息');
                                    addOneOfflineMsg(msg, (msgId)=>{
                                        msg.msgId = msgId;
                                        receipt.msgId = msgId;
                                        receipt.peerStatus = false;
                                        ack(receipt);
                                    });
                                }
                            }
                        });
                    }
                    // 会话里没有其他用户(对端未登录或已离开)
                    else{ 
                        console.log('对方已离开,已转离线消息');
                        addOneOfflineMsg(msg, (msgId)=>{
                            msg.msgId = msgId;
                            receipt.msgId = msgId;
                            receipt.peerStatus = false;
                            ack(receipt);
                        });
                    }
                }
                // 该会话已被删除
                else{ /*addOneOfflineMsg(msg);*/console.log('会话已被删除,不能发送消息')}  // ？是否可能发生
            }
        });
    }
});

http.listen(3000, ()=>{
    console.log('Message Server had started;');
})

process.setUncaughtExceptionCaptureCallback((err)=>{
    console.log(`exit unexpectedly:${err}`);
})

module.exports = io;
