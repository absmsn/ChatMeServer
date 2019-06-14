import mongoose from './conn';

let Schema = mongoose.Schema;

let MsgIdSchema = new Schema({
    idName: String,
    value: Number
});

let MsgId = mongoose.model('MsgId', MsgIdSchema);

MsgId.findOne({idName: 'gMsgId'}, (err, id)=>{
    if(err===null && id===null){
        MsgId.create({idName: 'gMsgId', value: 0}, (err)=>{
            if(err!==null) console.log('初始化消息id出现问题');
        })
    }
});

export default MsgId;