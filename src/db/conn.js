let mongoose = require('mongoose');

let mongoUrl = 'mongodb://127.0.0.1:27017/test';

mongoose.connect(mongoUrl,{
    useNewUrlParser: true,
    useFindAndModify: false,
    useCreateIndex: true
});

export default mongoose;
// module.exports = mongoose;