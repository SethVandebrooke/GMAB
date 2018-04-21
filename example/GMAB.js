const fs = require("fs");
const express = require("express");

function crawlDirectory(fs,path) {
    var items = fs.readdirSync(path);
    var output = [];
    items.forEach(function(name){
        var filePath = path+"/"+name;
        let type = fs.lstatSync(filePath).isDirectory() ? "dir" : "file";
        if (type === "dir") {
            var content = crawlDirectory(filePath);
            output.push({ name, type, content, path: filePath });
        } else {
            output.push({ name, type, path: filePath });
        }
    });
    return output;
}
function getFilesFromDirectory(path) {
    var contents = crawlDirectory(fs, path);
    var files = [];
    contents.forEach(function(item){
        if (item.type==="file") {
            files.push(item);
        }
    });
    return files;
}
function compileSite({path = "./source", out = "./public", listen = true, sourcePages = "/pages"} = {}) {
    if ( path.split("")[0] != "." ) { path = "." + path; }
    if ( out.split("")[0] != "." ) { out = "." + out; }
    if (path != "./" && path != "/" && path.replace(/\s/g,"") != "") {
        if (!fs.existsSync(path + sourcePages)) {
          throw new Error(path + sourcePages + " does not exist");
        }
        var pages = getFilesFromDirectory( path + sourcePages );
        if (!fs.existsSync(out)) {
            fs.mkdirSync(out);
        }
        var read = function(path) {return fs.readFileSync(path, 'utf8'); };
        pages.forEach(function(page){ // For each page
            var html = read(page.path);
            // Replace all ${directory} with the html files form those directories
            while (html.match(/\$[\{]\w+[^\}]/)!=null) {
                let directory = html.match(/\$[\{]\w+[^\}]/)[0].replace(/((\$)|(\{)|(\}))/g,"");
                var postsHTML = "";
                if (fs.existsSync(path+"/"+directory) || fs.existsSync(path+"/templates/"+directory)) { // If the directory exists
                  if (directory.includes("_template")) { // If it's a template directory
                    if (fs.existsSync(path+"/templates/"+directory+"/template.html") &&
                        fs.existsSync(path+"/templates/"+directory+"/template.json")) {
                        var template = read(path+"/templates/"+directory+"/template.html");
                        var metaData = JSON.parse(read(path+"/templates/"+directory+"/template.json"));
                        if (metaData.source && fs.existsSync(path+"/"+metaData.source)) {
                          var posts = getFilesFromDirectory(path+"/"+metaData.source);
                          for (var i in posts) {
                            if (metaData.max && i >= metaData.max) {
                              break;
                            }
                            var post = posts[i];
                            if (post.name.includes(".json")) {
                              var data = JSON.parse(read(post.path));
                              var temp = template;
                              if (typeof data == "object") {
                                for (var k in data) {
                                  while (temp.includes("{{"+k+"}}")) {
                                    temp = temp.replace("{{"+k+"}}",data[k]);
                                  }
                                }
                                postsHTML += temp;
                              } else {
                                return;
                              }
                            }
                          }
                        } else {
                          console.log("template source directory is not valid: ", metaData.source, " for "+directory);
                        }
                    } else {
                      console.log("template requires template.html and template.json to function correctly");
                    }
                  } else {
                    var posts = getFilesFromDirectory(path+"/"+directory);
                    posts.forEach(function(post){
                        postsHTML += read(post.path)+"\n";
                    });
                  }
                  html = html.replace("${"+directory+"}",postsHTML);
                }
            }
            if (html.match(/\$[\~]\w+[^\~]/)!=null) {
              let directory = html.match(/\$[\~]\w+[^\~]/)[0].replace(/((\$)|(\~)|(\~))/g,"");
              html = html.replace(html.match(/\$\~\w+\~/)[0],"");
              //console.log("Looking for "+directory);
              if (fs.existsSync(path+"/"+directory)) { // If the directory exists
                var packets = getFilesFromDirectory(path+"/"+directory);
                var temphtml = html;
                //console.log("Fetching "+directory);
                packets.forEach(function(packet){
                  if (packet.name.includes(".json")) { // Only fetch json files
                    var data = JSON.parse(read(packet.path));
                    if (typeof data == "object") {
                      for (var k in data) {
                        while (temphtml.includes("{{"+k+"}}")) {
                          temphtml = temphtml.replace("{{"+k+"}}",data[k]);
                        }
                      }
                    } else {
                      return;
                    }
                    var newfilename = data.FILENAME||packet.name.replace(".json",".html");
                    fs.writeFileSync(out+"/"+newfilename,temphtml);
                  }
                });
              } else {
                console.log("Directory not found");
              }
            } else {
              fs.writeFileSync(out+"/"+page.name,html);
            }
        });
        if (listen) {
            fs.watch(path,{recursive:true},function(event,filename){
                console.log("Recompiling");
                console.log(filename,event,path);
                compileSite({ path, out, listen : false, sourcePages });
            });
        }
    } else {
      throw new Error("Cannot compile directory containing server files.");
    }
}

compileSite();
var port = 8080;
var host = express();
var server = host.listen(port);
host.use(express.static("public"));
console.log("Goto localhost:"+port);
