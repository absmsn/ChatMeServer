import mongoose from './conn';

let Schema = mongoose.Schema;

let OfflineMessageSchema = new Schema({
    userId: String,
    sessionId: String,
    token: {
        type: String,
        index: true
    },
    type: String,
    content: Schema.Types.Mixed,
    source: String,
    sendTime: Date,
    msgId: {
        type: Number,
        index: true
    }
});

let OfflineMessage = mongoose.model('OfflineMessage', OfflineMessageSchema);

export default OfflineMessage;