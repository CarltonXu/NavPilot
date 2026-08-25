export const CATEGORY_ICON_GROUPS = [
  { key: 'general', names: ['folder','grid','home','link','globe','compass','map','mapPin','star','bookmark','tag','layers','dashboard','menu','pin'] },
  { key: 'work', names: ['building','briefcase','users','user','calendar','clock','mail','clipboard','listChecks','target','project','contact','printer'] },
  { key: 'communication', names: ['message','phone','headset','send','inbox','bell','megaphone','microphone','video','mobile','chatDots','atSign','share'] },
  { key: 'development', names: ['code','terminal','gitBranch','bug','api','webhook','workflow','tools','puzzle','lab','braces','command','binary'] },
  { key: 'infrastructure', names: ['database','server','cloud','network','wifi','router','hardDrive','container','boxes','cpu','monitor','memory','rack','storage'] },
  { key: 'content', names: ['docs','file','fileText','book','newspaper','image','camera','music','archive','download','upload','package','pdf','spreadsheet','film'] },
  { key: 'data', names: ['chart','barChart','pieChart','activity','gauge','table','filter','calculator','insights','search','lineChart','scatterChart','sigma'] },
  { key: 'security', names: ['shield','shieldCheck','lock','key','eye','fingerprint','scan','firewall','certificate','alert','userCheck','shieldAlert','vault'] },
  { key: 'commerce', names: ['wallet','creditCard','shoppingCart','store','receipt','dollar','bank','coins','truck','gift','percent','factory','handshake'] },
  { key: 'creative', names: ['palette','brush','pen','wand','lightbulb','rocket','shapes','scissors','presentation','sparkles','pencilRuler','swatch','frame'] },
  { key: 'ai', names: ['assistant','brain','bot','neural','aiChip','prompt','inputTokens','outputTokens','imageAi','vision','voiceAi','translate','agents','model','automation'] },
];

export const CATEGORY_ICONS = CATEGORY_ICON_GROUPS.flatMap(group =>
  group.names.map(name => `icon:${name}`),
);

export const COMMON_ICON_NAMES = [
  'link', 'home', 'folder', 'star', 'globe', 'briefcase',
  'users', 'code', 'database', 'docs', 'chart', 'shieldCheck',
];

const ICON_LABEL_VALUES = {
  folder:['文件夹','Folder'], grid:['网格','Grid'], home:['首页','Home'], link:['链接','Link'], globe:['全球网站','Globe'], compass:['指南针','Compass'], map:['地图','Map'], mapPin:['位置','Map pin'], star:['星标','Star'], bookmark:['书签','Bookmark'], tag:['标签','Tag'], layers:['图层','Layers'],
  building:['办公楼','Building'], briefcase:['工作','Briefcase'], users:['团队','Users'], user:['用户','User'], calendar:['日历','Calendar'], clock:['时钟','Clock'], mail:['邮件','Mail'], clipboard:['剪贴板','Clipboard'], listChecks:['任务清单','Checklist'], target:['目标','Target'],
  message:['消息','Message'], phone:['电话','Phone'], headset:['客服耳机','Headset'], send:['发送','Send'], inbox:['收件箱','Inbox'], bell:['通知','Bell'], megaphone:['公告','Megaphone'], microphone:['麦克风','Microphone'], video:['视频','Video'], mobile:['手机','Mobile'],
  code:['代码','Code'], terminal:['终端','Terminal'], gitBranch:['代码分支','Git branch'], bug:['缺陷','Bug'], api:['接口','API'], webhook:['Webhook','Webhook'], workflow:['工作流','Workflow'], tools:['工具','Tools'], puzzle:['插件','Puzzle'], lab:['实验室','Lab'],
  database:['数据库','Database'], server:['服务器','Server'], cloud:['云服务','Cloud'], network:['网络','Network'], wifi:['无线网络','Wi-Fi'], router:['路由器','Router'], hardDrive:['硬盘','Hard drive'], container:['容器','Container'], boxes:['集群','Boxes'], cpu:['处理器','CPU'], monitor:['显示器','Monitor'],
  docs:['文档','Documents'], file:['文件','File'], fileText:['文本文件','Text file'], book:['书籍','Book'], newspaper:['资讯','Newspaper'], image:['图片','Image'], camera:['相机','Camera'], music:['音乐','Music'], archive:['归档','Archive'], download:['下载','Download'], upload:['上传','Upload'], package:['软件包','Package'],
  chart:['趋势图','Chart'], barChart:['柱状图','Bar chart'], pieChart:['饼图','Pie chart'], activity:['活动趋势','Activity'], gauge:['仪表盘','Gauge'], table:['表格','Table'], filter:['筛选','Filter'], calculator:['计算器','Calculator'], insights:['数据洞察','Insights'], search:['搜索','Search'],
  shield:['盾牌','Shield'], shieldCheck:['安全认证','Shield check'], lock:['锁定','Lock'], key:['密钥','Key'], eye:['可见性','Eye'], fingerprint:['指纹','Fingerprint'], scan:['扫描','Scan'], firewall:['防火墙','Firewall'], certificate:['证书','Certificate'], alert:['警告','Alert'],
  wallet:['钱包','Wallet'], creditCard:['信用卡','Credit card'], shoppingCart:['购物车','Shopping cart'], store:['商店','Store'], receipt:['收据','Receipt'], dollar:['金额','Dollar'], bank:['银行','Bank'], coins:['硬币','Coins'], truck:['物流','Truck'], gift:['礼物','Gift'],
  palette:['调色板','Palette'], brush:['画笔','Brush'], pen:['钢笔','Pen'], wand:['魔法棒','Wand'], lightbulb:['灵感','Lightbulb'], rocket:['火箭','Rocket'], shapes:['图形','Shapes'], scissors:['剪刀','Scissors'], presentation:['演示','Presentation'], sparkles:['闪光','Sparkles'],
  dashboard:['仪表面板','Dashboard'], menu:['菜单','Menu'], pin:['固定','Pin'],
  project:['项目','Project'], contact:['联系人','Contact'], printer:['打印机','Printer'],
  chatDots:['对话','Chat'], atSign:['邮件地址','At sign'], share:['分享','Share'],
  braces:['代码括号','Braces'], command:['命令','Command'], binary:['二进制','Binary'],
  memory:['内存','Memory'], rack:['机架','Server rack'], storage:['存储','Storage'],
  pdf:['PDF 文档','PDF'], spreadsheet:['电子表格','Spreadsheet'], film:['影片','Film'],
  lineChart:['折线图','Line chart'], scatterChart:['散点图','Scatter chart'], sigma:['统计计算','Sigma'],
  userCheck:['用户认证','Verified user'], shieldAlert:['安全告警','Shield alert'], vault:['保险库','Vault'],
  percent:['折扣','Percent'], factory:['工厂','Factory'], handshake:['合作','Handshake'],
  pencilRuler:['设计工具','Pencil and ruler'], swatch:['色板','Color swatch'], frame:['画框','Frame'],
  assistant:['AI 助手','AI assistant'], brain:['智能大脑','AI brain'], bot:['机器人','Bot'], neural:['神经网络','Neural network'], aiChip:['AI 芯片','AI chip'], prompt:['提示词','Prompt'], inputTokens:['输入 Token','Input tokens'], outputTokens:['输出 Token','Output tokens'], imageAi:['AI 图像','AI image'], vision:['机器视觉','AI vision'], voiceAi:['智能语音','AI voice'], translate:['智能翻译','AI translate'], agents:['智能体','AI agents'], model:['模型','AI model'], automation:['智能自动化','AI automation'],
};

export const ICON_LABELS = Object.freeze(Object.fromEntries(
  Object.entries(ICON_LABEL_VALUES).map(([name, [zh, en]]) => [name, {
    zh,
    en,
    search: `${name} ${en} ${zh}`.toLocaleLowerCase(),
  }]),
));
