import mongoose from './conn'

let Schema = mongoose.Schema;

let UserListSchema = Schema({
    userId: {
        type: String,
        index: true
    },
    sessionIdList: Array,
    socketId: String,
    onlineStatus: {
        type:Boolean,
        default:true
    },
    lastOnlineTime:{
        type: Date,
        default: Date.now()
    }
});

let UserList = mongoose.model('UserList', UserListSchema);

export default UserList;