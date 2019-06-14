const express = require('express');
const fileSever = express();
const fs = require('fs');
const path = require('path');
const {URL} = require('url')
const multiparty = require('multiparty');
const querystring = require('querystring')


let hostname = "http://localhost:3008/";
// let hostname = "http://114.116.79.159:3008/";
let tokenFilesDir = path.join(__dirname, '..', 'tokenfiles');
let userFilesDir = path.join(__dirname, '..', 'userfiles');

let tokenNumberArea = {
    contentArea: [],
    cacheVolume: 200*(1024**2),
    writeFile : function(file, fileName){
        let authToken;
        do{
            authToken = randomStr(6);
        }
        while(this.contentArea.findIndex(x=> x.authToken===authToken)!==-1);
        let cb = {
            authToken: authToken,
            fileName: fileName,
        };
        if(this.cacheVolume > file.length){
            cb.file = file; cb.inMemory = true;
            this.cacheVolume -= file.length;
        }
        else{
            let p = path.join(tokenFilesDir, fileName);
            while(fs.existsSync(p)){ 
                let dotIndex = p.lastIndexOf('.');
                if(dotIndex !== -1){
                    p = p.slice(0, dotIndex) + "(1)" +'.' + p.slice(dotIndex+1, p.length);
                }
                else{
                    p += "(1)";
                }
            }
            fs.writeFileSync(p, file); // 不要忘了是两个参数
            cb.file = p; cb.inMemory = false;
        }
        this.contentArea.push(cb);
        return authToken;
    },
    getFile: function(authToken){
        let index = this.contentArea.findIndex(x=> x.authToken===authToken);
        if(index===-1) return ;
        let item = this.contentArea[index];
        this.contentArea.splice(index, 1);
        if(item.inMemory){
            this.cacheVolume += item.file.length;
            return item.file;
        }
        else{
            if(fs.existsSync(item.file)){
                let fdata = fs.readFileSync(item.file);
                fs.unlink(item.file, (err)=>{
                    if(err) console.log('删除token文件出现问题');
                });
                return fdata;
            }
        }
    }
}


let bodyParser = require('body-parser');

let crossDomain = function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Content-Disposition");
    res.header("Access-Control-Allow-Methods", "POST,GET,DELETE");
    res.header("X-Powered-By", ' 3.2.1')
    res.header("Content-Type", "*/*;charset=utf-8");
    next();
}

fileSever.use(crossDomain);
fileSever.use(bodyParser.json());
fileSever.use(bodyParser.urlencoded({extended: false}));

fileSever.get('/download/:token/:filename' , function (req, res) {
    
    let filePath = path.join(userFilesDir, req.params.token, req.params.filename);
    if(fs.existsSync(filePath)){
        if(req.query.download==='true'){
            // 'Content-Type': 'application/octet-stream', //告诉浏览器这是一个二进制文件  
            // 'Content-Disposition': 'attachment;' //告诉浏览器这是一个需要下载的文件  
            res.download(filePath);  
        }
        else{
            fs.readFile(filePath, function(err,data){
                if(!err){
                    res.send(data); // 或者res.write
                    // res.send(); // 不要忘了加上这一行 // 不要加上这一行
                }
            });   
        }
    }
    else{res.set('status', 404);}
});

fileSever.post('/removeOfflineFiles', function(req,res){
    let urls = req.body.urls;
    urls = typeof urls === 'string'?[urls]:urls;
    if(urls){
        let fpath;
        
        for(let url of urls){
            let u = new URL(url);
            let parts = u.pathname.split('/');
            if(parts.length===4){
                fpath = path.join(userFilesDir, parts[2], parts[3]);
                if(fs.existsSync(fpath) && fs.fstatSync(fpath).isFile()){
                    fs.unlinkSync(fpath);
                }
            }
        }
    }
});

fileSever.post('/upload', function (req, res) {

    let form = new multiparty.Form();
    form.parse(req, function (err, fields, files) {
        if (!err) {
            let token = fields.token[0];
            let fileName = files.file[0].originalFilename;
            let readStream = fs.createReadStream(files.file[0].path);
            let fileDir = path.join(userFilesDir, token);
            if (!fs.existsSync(fileDir)) {
                fs.mkdirSync(fileDir);
            }
            let writeStream = fs.createWriteStream(path.join(fileDir, fileName));
            readStream.pipe(writeStream);
            res.contentType('text/plain');
            res.send({'url': hostname + path.join('download', token, fileName)});
        }
    });
});

fileSever.delete('/removeUserFiles/:token', (req, res)=>{
    let token = req.params.token;
    let dirname = path.join(userFilesDir, token);
    if(fs.existsSync(dirname) && fs.statSync(dirname).isDirectory()){
        fs.readdirSync(dirname).forEach((fileName)=>{
            let curPath = path.join(dirname, fileName);
            fs.unlinkSync(curPath);
        })
        fs.rmdirSync(dirname);
        res.send(); 
    }
});

fileSever.get('/downloadTokenFile/:authToken',function(req, res){
    let authToken = req.params.authToken;
    res.send(tokenNumberArea.getFile(authToken));
});

fileSever.post('/uploadTokenFile', function(req, res){
    let form = new multiparty.Form({
        autoFiles: false
    });

    form.on('part', function(part){
        if(part.filename){
            // let content = part.read(part.byteCount);
            // console.log(part.readableLength); 还剩多少字节可读
            // console.log(`整个文件的字节数:${part.byteCount}`); // 该部分的字节数
            // console.log(part.byteOffset); 该部分在整个请求体里的偏移量
            let offset  = 0;
            let buffer = Buffer.alloc(part.byteCount);
            part.on('data', (chunk)=>{ // 当有数据到达时触发该方法
                chunk.copy(buffer, offset ,0, chunk.length);
                offset += chunk.length;
            });
            part.on('end', ()=>{
                let authToken = tokenNumberArea.writeFile(buffer, part.filename);
                res.contentType('text/plain');
                res.send({returnedNumber: authToken});
            });
        }
    });
    form.parse(req);
});

fileSever.listen(3008, function () {
    console.log('the file server had started;');
    if (!fs.existsSync(userFilesDir)) {
        fs.mkdirSync(userFilesDir);
    }
    if (!fs.existsSync(tokenFilesDir)) {
        fs.mkdirSync(tokenFilesDir);
    }
});

function ArrayBufferToBuffer(arraybuffer) {
    let buf = Buffer.alloc(arraybuffer.byteLength);
    let view = new Uint8Array(arraybuffer);
    for (var i = 0; i < buf.length; ++i) {
        buf[i] = view[i];
    }
    return buf;
}

function randomStr(length){
    let str = "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678";
    let maxPos = str.length;

    var pwd = '';
    for (let i = 0; i < length; i++) {
　　　　pwd += str.charAt(Math.floor(Math.random() * maxPos));
    }
    return pwd;
}
