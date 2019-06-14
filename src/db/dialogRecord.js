import mongoose from './conn';

let Schema = mongoose.Schema;

let DialogRecordSchema = new Schema({
    token: String,
    establishedTime:{
        type: Date,
        default: Date.now
    },
    closedTime: Date,
    sessionId: String
});

DialogRecordSchema.virtual('lastingTime').get(()=>{
    return this.closedTime - this.establishedTime;
})

let DialogRecord = mongoose.model('DialogRecord', DialogRecordSchema);

export default DialogRecord;