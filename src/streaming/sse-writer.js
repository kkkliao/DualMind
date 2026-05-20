function sse(res, payload) {
  res.write('data: ' + JSON.stringify(payload) + '\n\n');
}

function writeDone(res) {
  res.write('data: [DONE]\n\n');
}

module.exports = {
  sse,
  writeDone
};
