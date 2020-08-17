#!/usr/bin/env ts-node

import * as express from "express";
import * as bodyParser from 'body-parser';
import * as runtime from "./runtime/runtime";
import * as sample from "./runtime/sample";
import * as base from "./runtime/base";
import * as WebSocket from "ws";
import * as fs from "fs";
import * as path from "path";
import Tool from "./tool";

const app = express();
const port = process.env.PORT || 8080;
const wssport = Number(process.env.WSSPORT || 8081);
let RequestTimeout = parseInt(process.env.TIMEOUT) || 120000;


console.log("WSS Listen:", wssport)
const wss = new WebSocket.Server({ port: wssport });
wss.on('connection', (ws) => {
  const run = new runtime.Runtime()
  ws.on('message', async (message) => {
    console.log('cmd: %s', message);
    const json = JSON.parse(<string>message)
    const result = await runCmds(run, json)
    ws.send(JSON.stringify(result))
  });

  ws.on('close', async (message) => {
    run.Close()
  });

  ws.send('hello');
});

app.use(function (req, res, next) {
  res.setTimeout(RequestTimeout, function () {
    console.log('Request has timed out.');
    res.sendStatus(408);
  });
  next();
});
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));

app.use("/", express.static("./public"))

app.get("/demo.json", async (req, res) => {
  res.send(JSON.stringify(sample.Sample))
});

app.post("/run", async (req, res) => {
  const json = req.body;
  if (json.Timeout) res.setTimeout(json.Timeout)

  const run = new runtime.Runtime()
  const result = await runCmds(run, json.Task)
  run.Close()
  if (res.writableEnded) return // 避免超时后还继续输出
  res.json(result)
});

/**
 * 用于获取当前项目的版本号。 此接口返回的版本号为项目仓库最新一次提交(commit)的版本号。
 *
 * @author fanxuejiao
 * @date 2020年8月17日17点17分
 */
app.get("/version", async (req, res) => {
    try {
        const commitList = await Tool.getGitHubReposCommitList("ohko", "puppeteer-json");
        if (commitList.length <= 0) {
            res.send("no commit");
        } else {
            res.send(commitList[0].sha); // f1890635324d60aab5715377ba4eefacd65a152c
        }
    }catch (e) {
        res.send("error is:" + e.message);
    }
});

app.get("/timeout", async (req, res) => {
  const timeout = parseInt(req.query.timeout);
  if (timeout) RequestTimeout = timeout
  return res.send(String(RequestTimeout));
});

app.get("/download", async (req, res) => {
    // 123.png=DLDl82n0RRMA.gif
    // C:\Users\pc-11\Downloads\
    // const prefix = './download/';

    const qFileName = req.query.fileName;
    const prefix = req.query.downPrefix;
    if (!qFileName || !prefix) {
        res.writeHead(404, {
            'content-type': 'text/html; charset=utf-8',
        });
        res.end('参数不正确');
        return;
    }

    const localFileName = qFileName.split('=')[1];
    const dowmFileName = qFileName.split('=')[0];
    const Path = prefix + localFileName;
    
    fs.readFile(Path, (err, data) => {
        if (err) {
            console.log('err....', err);

            res.writeHead(404, {
                'content-type': 'text/html; charset=utf-8',
            });
            res.end('文件未找到');
            return;
        }
        res.writeHead(200, {
            'Content-Disposition': 'attachment; filename=' + dowmFileName,
            'content-type': 'application/pdf',
        });
        fs.createReadStream(Path).pipe(res);
    });
})

app.listen(port, () => {
  console.log("DEBUG:", process.env.DEBUG ? true : false)
  console.log("Request Timeout:", RequestTimeout)
  console.log(`Example app listening on port ${port}!`)
});

const runCmds = async (run: runtime.Runtime, cmds: any) => {
  let no: Number = 0, data: any = "SUCCESS", result: base.IResult;
  // const run = new runtime.Runtime()
  try {
    await run.AsyncStart(cmds)
  } catch (e) {
    no = 1, data = e.message
  } finally {
    result = run.SyncGetResult()
    return {
      No: no,
      Data: (typeof data == "string" ? data : JSON.stringify([data])),
      DB: result.DB,
      Logs: result.Logs,
      Screenshots: result.Screenshots,
      Origin: JSON.stringify(cmds)
    }
  }
}