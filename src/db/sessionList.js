import mongoose from './conn';

let Schema = mongoose.Schema;

let SessionListSchema = new Schema({
    sessionId: {
        type: String,
        index: true
    },
    userIdList: Array,
    token: String
});

let SessionList = mongoose.model('SessionList', SessionListSchema);

export default SessionList;