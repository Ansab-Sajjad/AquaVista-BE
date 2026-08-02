const fs = require('fs');
const path = require('path');
const http = require('http');

const filePath = path.join(__dirname, '..', 'AquaVista FE', 'public', 'images', 'avatars', 'avatar-1.jpg');
if (!fs.existsSync(filePath)) {
  console.error('file missing', filePath);
  process.exit(1);
}
const fileData = fs.readFileSync(filePath);
const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
const payload = Buffer.concat([
  Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="avatar"; filename="avatar-1.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
  fileData,
  Buffer.from(`\r\n--${boundary}--\r\n`),
]);

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/auth/me/avatar',
  method: 'POST',
  headers: {
    'Content-Type': 'multipart/form-data; boundary=' + boundary,
    'Content-Length': payload.length,
    'Authorization': 'Bearer INVALID_TOKEN',
  },
};

const req = http.request(options, (res) => {
  console.log('status', res.statusCode);
  let body = '';
  res.setEncoding('utf8');
  res.on('data', (chunk) => (body += chunk));
  res.on('end', () => console.log('body', body));
});

req.on('error', (err) => {
  console.error('request error', err);
});

req.write(payload);
req.end();
