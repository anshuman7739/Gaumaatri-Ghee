'use strict';

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'orders.json');

function readAll() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function writeAll(orders) {
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(orders, null, 2), 'utf8');
  fs.renameSync(tmp, DB_PATH);
}

function insert(order) {
  const orders = readAll();
  orders.push(order);
  writeAll(orders);
  return order;
}

module.exports = { readAll, insert };

