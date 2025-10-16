// backend/utils/pdf-table-extractor.js
// Modified from https://github.com/mozilla/pdf.js/blob/master/examples/node/pdf2svg.js

export default function pdf_table_extractor(doc) {
  var numPages = doc.numPages;
  var result = {};
  result.pageTables = [];
  result.numPages = numPages;
  result.currentPages = 0;

  // Get the pdfjsLib from the global scope
  var pdfjsLib = global.pdfjsLib;

  var transform_fn = function (m1, m2) {
    return [
      m1[0] * m2[0] + m1[2] * m2[1],
      m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3],
      m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
      m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
    ];
  };

  var applyTransform_fn = function (p, m) {
    var xt = p[0] * m[0] + p[1] * m[2] + m[4];
    var yt = p[0] * m[1] + p[1] * m[3] + m[5];
    return [xt, yt];
  };

  var lastPromise = Promise.resolve();

  var loadPage = function (pageNum) {
    return doc.getPage(pageNum).then(function (page) {
      var verticles = [];
      var horizons = [];
      var merges = {};
      var merge_alias = {};
      var transformMatrix = [1, 0, 0, 1, 0, 0];
      var transformStack = [];

      return page
        .getOperatorList()
        .then(function (opList) {
          var REVOPS = [];
          for (var op in pdfjsLib.OPS) {
            REVOPS[pdfjsLib.OPS[op]] = op;
          }

          var edges = [];
          var line_max_width = 2;
          var lineWidth = null;
          var current_x, current_y;

          while (opList.fnArray.length) {
            var fn = opList.fnArray.shift();
            var args = opList.argsArray.shift();

            if (pdfjsLib.OPS.constructPath == fn) {
              while (args[0].length) {
                var op = args[0].shift();
                if (op == pdfjsLib.OPS.rectangle) {
                  var x = args[1].shift();
                  var y = args[1].shift();
                  var width = args[1].shift();
                  var height = args[1].shift();
                  if (Math.min(width, height) < line_max_width) {
                    edges.push({
                      y: y,
                      x: x,
                      width: width,
                      height: height,
                      transform: transformMatrix,
                    });
                  }
                } else if (op == pdfjsLib.OPS.moveTo) {
                  current_x = args[1].shift();
                  current_y = args[1].shift();
                } else if (op == pdfjsLib.OPS.lineTo) {
                  var x = args[1].shift();
                  var y = args[1].shift();

                  if (lineWidth == null) {
                    if (current_x == x) {
                      edges.push({
                        y: Math.min(y, current_y),
                        x: Math.min(x, current_x),
                        height: Math.abs(y - current_y),
                        transform: transformMatrix,
                      });
                    } else if (current_y == y) {
                      edges.push({
                        x: Math.min(x, current_x),
                        y: Math.min(y, current_y),
                        width: Math.abs(x - current_x),
                        transform: transformMatrix,
                      });
                    }
                  } else {
                    if (current_x == x) {
                      edges.push({
                        y: Math.min(y, current_y),
                        x: x - lineWidth / 2,
                        width: lineWidth,
                        height: Math.abs(y - current_y),
                        transform: transformMatrix,
                      });
                    } else if (current_y == y) {
                      edges.push({
                        x: Math.min(x, current_x),
                        y: y - lineWidth / 2,
                        height: lineWidth,
                        width: Math.abs(x - current_x),
                        transform: transformMatrix,
                      });
                    }
                  }
                  current_x = x;
                  current_y = y;
                }
              }
            } else if (pdfjsLib.OPS.save == fn) {
              transformStack.push(transformMatrix);
            } else if (pdfjsLib.OPS.restore == fn) {
              transformMatrix = transformStack.pop();
            } else if (pdfjsLib.OPS.transform == fn) {
              transformMatrix = transform_fn(transformMatrix, args);
            } else if (pdfjsLib.OPS.setLineWidth == fn) {
              lineWidth = args[0];
            }
          }

          edges = edges.map(function (edge) {
            var point1 = applyTransform_fn([edge.x, edge.y], edge.transform);
            var point2 = applyTransform_fn(
              [edge.x + edge.width, edge.y + edge.height],
              edge.transform,
            );
            return {
              x: Math.min(point1[0], point2[0]),
              y: Math.min(point1[1], point2[1]),
              width: Math.abs(point1[0] - point2[0]),
              height: Math.abs(point1[1] - point2[1]),
            };
          });

          // Process vertical lines
          var edges1 = JSON.parse(JSON.stringify(edges));
          edges1.sort(function (a, b) {
            return a.x - b.x || a.y - b.y;
          });

          var current_x = null;
          var current_y = null;
          var current_height = 0;
          var lines = [];

          var lines_add_verticle = function (lines, top, bottom) {
            var hit = false;
            for (var i = 0; i < lines.length; i++) {
              if (lines[i].bottom < top || lines[i].top > bottom) {
                continue;
              }
              hit = true;
              top = Math.min(lines[i].top, top);
              bottom = Math.max(lines[i].bottom, bottom);
              var new_lines = [];
              if (i > 1) {
                new_lines = lines.slice(0, i - 1);
              }
              new_lines = new_lines.concat(lines.slice(i + 1));
              lines = new_lines;
              return lines_add_verticle(lines, top, bottom);
            }
            if (!hit) {
              lines.push({ top: top, bottom: bottom });
            }
            return lines;
          };

          while (edges1.length > 0) {
            var edge = edges1.shift();
            if (edge.width > line_max_width) {
              continue;
            }

            if (null === current_x || edge.x - current_x > line_max_width) {
              if (current_height > line_max_width) {
                lines = lines_add_verticle(
                  lines,
                  current_y,
                  current_y + current_height,
                );
              }
              if (null !== current_x && lines.length) {
                verticles.push({ x: current_x, lines: lines });
              }
              current_x = edge.x;
              current_y = edge.y;
              current_height = 0;
              lines = [];
            }

            if (Math.abs(current_y + current_height - edge.y) < 10) {
              current_height = edge.height + edge.y - current_y;
            } else {
              if (current_height > line_max_width) {
                lines = lines_add_verticle(
                  lines,
                  current_y,
                  current_y + current_height,
                );
              }
              current_y = edge.y;
              current_height = edge.height;
            }
          }

          if (current_height > line_max_width) {
            lines = lines_add_verticle(
              lines,
              current_y,
              current_y + current_height,
            );
          }
          if (current_x === null || lines.length == 0) {
            return {};
          }
          verticles.push({ x: current_x, lines: lines });

          // Process horizontal lines
          var edges2 = JSON.parse(JSON.stringify(edges));
          edges2.sort(function (a, b) {
            return a.y - b.y || a.x - b.x;
          });

          current_x = null;
          current_y = null;
          var current_width = 0;

          var lines_add_horizon = function (lines, left, right) {
            var hit = false;
            for (var i = 0; i < lines.length; i++) {
              if (lines[i].right < left || lines[i].left > right) {
                continue;
              }
              hit = true;
              left = Math.min(lines[i].left, left);
              right = Math.max(lines[i].right, right);
              var new_lines = [];
              if (i > 1) {
                new_lines = lines.slice(0, i - 1);
              }
              new_lines = new_lines.concat(lines.slice(i + 1));
              lines = new_lines;
              return lines_add_horizon(lines, left, right);
            }
            if (!hit) {
              lines.push({ left: left, right: right });
            }
            return lines;
          };

          while (edges2.length > 0) {
            var edge = edges2.shift();
            if (edge.height > line_max_width) {
              continue;
            }
            if (null === current_y || edge.y - current_y > line_max_width) {
              if (current_width > line_max_width) {
                lines = lines_add_horizon(
                  lines,
                  current_x,
                  current_x + current_width,
                );
              }
              if (null !== current_y && lines.length) {
                horizons.push({ y: current_y, lines: lines });
              }
              current_x = edge.x;
              current_y = edge.y;
              current_width = 0;
              lines = [];
            }

            if (Math.abs(current_x + current_width - edge.x) < 10) {
              current_width = edge.width + edge.x - current_x;
            } else {
              if (current_width > line_max_width) {
                lines = lines_add_horizon(
                  lines,
                  current_x,
                  current_x + current_width,
                );
              }
              current_x = edge.x;
              current_width = edge.width;
            }
          }

          if (current_width > line_max_width) {
            lines = lines_add_horizon(
              lines,
              current_x,
              current_x + current_width,
            );
          }
          if (current_y === null || lines.length == 0) {
            return {};
          }
          horizons.push({ y: current_y, lines: lines });

          var search_index = function (v, list) {
            for (var i = 0; i < list.length; i++) {
              if (Math.abs(list[i] - v) < 5) {
                return i;
              }
            }
            return -1;
          };

          // Handle merged cells
          var x_list = verticles.map(function (a) {
            return a.x;
          });
          var y_list = horizons
            .map(function (a) {
              return a.y;
            })
            .sort(function (a, b) {
              return b - a;
            });

          var y_max = verticles
            .map(function (verticle) {
              return verticle.lines[0].bottom;
            })
            .sort()
            .reverse()[0];
          var y_min = verticles
            .map(function (verticle) {
              return verticle.lines[verticle.lines.length - 1].top;
            })
            .sort()[0];

          var top_out = search_index(y_min, y_list) == -1 ? 1 : 0;
          var bottom_out = search_index(y_max, y_list) == -1 ? 1 : 0;

          if (top_out) {
            horizons.unshift({ y: y_min, lines: [] });
          }
          if (bottom_out) {
            horizons.push({ y: y_max, lines: [] });
          }
        })
        .then(function () {
          // CRITICAL: This .then() must be CHAINED after getOperatorList(), not nested inside
          return page.getTextContent().then(function (content) {
            var tables = [];
            var table_pos = [];

            for (var i = 0; i < horizons.length - 1; i++) {
              tables[i] = [];
              table_pos[i] = [];
              for (var j = 0; j < verticles.length - 1; j++) {
                tables[i][j] = '';
                table_pos[i][j] = null;
              }
            }

            while (content.items.length > 0) {
              var item = content.items.shift();
              var x = item.transform[4];
              var y = item.transform[5];

              var col = -1;
              for (var i = 0; i < verticles.length - 1; i++) {
                if (x >= verticles[i].x && x < verticles[i + 1].x) {
                  col = i;
                  break;
                }
              }
              if (col == -1) {
                continue;
              }

              var row = -1;
              for (var i = 0; i < horizons.length - 1; i++) {
                if (y >= horizons[i].y && y < horizons[i + 1].y) {
                  row = horizons.length - i - 2;
                  break;
                }
              }
              if (row == -1) {
                continue;
              }

              if (
                null !== table_pos[row][col] &&
                Math.abs(table_pos[row][col] - y) > 5
              ) {
                tables[row][col] += '\n';
              }
              table_pos[row][col] = y;
              tables[row][col] += item.str;
            }

            if (tables.length) {
              result.pageTables.push({
                page: pageNum,
                tables: tables,
                merges: merges,
                merge_alias: merge_alias,
                width: verticles.length - 1,
                height: horizons.length - 1,
              });
            }

            // CRITICAL: Increment currentPages AFTER processing text content
            result.currentPages++;
          });
        });
    });
  };

  for (var i = 1; i <= numPages; i++) {
    lastPromise = lastPromise.then(loadPage.bind(null, i));
  }

  return lastPromise.then(function () {
    return result;
  });
}
