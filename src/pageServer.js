const express = require('express')
const ps = express();
const path = require('path');

let crossDomain = function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Content-Disposition");
    res.header("Access-Control-Allow-Methods", "POST,GET,DELETE");
    res.header("X-Powered-By", ' 3.2.1')
    res.header("Content-Type", "*/*;charset=utf-8");
    next();
}
// 第一个参数是虚拟路径前缀,第二个参数是目录在磁盘中的路径
ps.use('/static', express.static(path.join(__dirname, '..', 'dist', 'static')));
ps.use(crossDomain);

ps.get('/', function(req, res){
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

ps.listen(3005, ()=>{
    console.log('page server had started');
});