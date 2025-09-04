
const nodemailer = require('nodemailer');
//MAİL
const transporter = nodemailer.createTransport({
    service: 'Gmail',
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: 'alimcan145@gmail.com',
      pass: 'kbkr molp znik ewzl',
    },
  });

  module.exports = transporter;