// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: http://codemirror.net/LICENSE

// Define search commands. Depends on dialog.js or another
// implementation of the openDialog method.

// Replace works a little oddly -- it will do the replace on the next
// Ctrl-G (or whatever is bound to findNext) press. You prevent a
// replace by making sure the match is no longer selected when hitting
// Ctrl-G.

(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    mod(require("../../lib/codemirror"), require("./searchcursor"), require("../dialog/dialog"));
  else if (typeof define == "function" && define.amd) // AMD
    define(["../../lib/codemirror", "./searchcursor", "../dialog/dialog"], mod);
  else // Plain browser env
    mod(CodeMirror);
})(function(CodeMirror) {
  "use strict";

  function type(obj){
    var t = typeof obj;

    if(t == "object"  && obj instanceof Array){
      t = "array";
    }
    return t;
  }

  function extend(deep,target,objs) {
    var args = Array.prototype.slice.call(arguments);
    if(args.length < 2){
      return;
    }
    objs = args.slice(2);
    if(args.length == 2){
      deep = null;
      target = args[0];
      objs = [args[1]];
    }

    if(type(target) !== "object"){
      return target;
    }

    for(var i=0;i<objs.length;i++){
      var obj = objs[i];

      if(type(obj)!== "object"){return target;}

      for(var name in obj){
        if(!target[name] || type(target[name]) !== type(obj[name]) 
          || type(target[name])!== "object"  || !deep ){
          target[name]=obj[name];
          continue;
        }

        target[name] = extend(target[name],obj[name]);
      }
    }

    return target;
  }

  function searchOverlay(query, caseInsensitive) {
    if (typeof query == "string")
      query = new RegExp(query.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&"), caseInsensitive ? "gi" : "g");
    else if (!query.global)
      query = new RegExp(query.source, query.ignoreCase ? "gi" : "g");

    return {token: function(stream) {
      query.lastIndex = stream.pos;
      var match = query.exec(stream.string);
      if (match && match.index == stream.pos) {
        stream.pos += match[0].length;
        return "searching";
      } else if (match) {
        stream.pos = match.index;
      } else {
        stream.skipToEnd();
      }
    }};
  }

  function SearchState() {
    this.posFrom = this.posTo = this.lastQuery = this.query = null;
    this.overlay = null;
  }

  function getSearchState(cm) {
    return cm.state.search || (cm.state.search = new SearchState());
  }

  function queryCaseInsensitive(query) {
    return typeof query == "string" && query == query.toLowerCase();
  }

  function getSearchCursor(cm, query, pos) {
    // Heuristic: if the query string is all lowercase, do a case insensitive search.
    return cm.getSearchCursor(query, pos, queryCaseInsensitive(query));
  }

  function persistentDialog(cm, text, deflt, f) {
    var options = extend({},cm.getOption('search') || {},{
      value: deflt,
      selectValueOnOpen: true,
      closeOnEnter: false,
      onClose: function() { clearSearch(cm); }
    });

    options.classes = ['search-presistent-dialog'].concat(options.classes||[]);

    cm.openDialog(text, f, options);
  }

  function dialog(cm, text, shortText, deflt, f) {
    var options = extend({},cm.getOption('search') || {},{
      value: deflt, 
      selectValueOnOpen: true
    });

    options.classes = ['search-dialog'].concat(options.classes||[]);

    if (cm.openDialog) cm.openDialog(text, f, options);
    else f(prompt(shortText, deflt));
  }

  function confirmDialog(cm, text, shortText, fs) {
    var options = extend({},cm.getOption('search')||{});
    options.classes = ['search-confirm-dialog'].concat(options.classes||[]);

    if (cm.openConfirm) cm.openConfirm(text, fs, options);
    else if (confirm(shortText)) fs[0]();
  }

  function parseQuery(query) {
    var isRE = query.match(/^\/(.*)\/([a-z]*)$/);
    if (isRE) {
      try { query = new RegExp(isRE[1], isRE[2].indexOf("i") == -1 ? "" : "i"); }
      catch(e) {} // Not a regular expression after all, do a string search
    }
    if (typeof query == "string" ? query == "" : query.test(""))
      query = /x^/;
    return query;
  }

  function queryDialog(cm){
    var qd = cm.getOption('search') && cm.getOption('search').queryDialog;
    return qd || 'Search: <input type="text" style="width: 10em" class="CodeMirror-search-field"/> <span style="color: #888" class="CodeMirror-search-hint">(Use /re/ syntax for regexp search)</span>';
  }

  function startSearch(cm, state, query) {
    state.queryText = query;
    state.query = parseQuery(query);
    cm.removeOverlay(state.overlay, queryCaseInsensitive(state.query));
    state.overlay = searchOverlay(state.query, queryCaseInsensitive(state.query));
    cm.addOverlay(state.overlay);
    if (cm.showMatchesOnScrollbar) {
      if (state.annotate) { state.annotate.clear(); state.annotate = null; }
      state.annotate = cm.showMatchesOnScrollbar(state.query, queryCaseInsensitive(state.query));
    }
  }

  function doSearch(cm, rev, persistent) {
    var state = getSearchState(cm);
    if (state.query) return findNext(cm, rev);
    var q = cm.getSelection() || state.lastQuery;
    if (persistent && cm.openDialog) {
      persistentDialog(cm, queryDialog(cm), q, function(query, event) {
        CodeMirror.e_stop(event);
        if (!query) return;
        if (query != state.queryText) startSearch(cm, state, query);
        findNext(cm, event.shiftKey);
      });
    } else {
      dialog(cm, queryDialog(cm), "Search for:", q, function(query) {
        if (query && !state.query) cm.operation(function() {
          startSearch(cm, state, query);
          state.posFrom = state.posTo = cm.getCursor();
          findNext(cm, rev);
        });
      });
    }
  }

  function findNext(cm, rev) {cm.operation(function() {
    var state = getSearchState(cm);
    var cursor = getSearchCursor(cm, state.query, rev ? state.posFrom : state.posTo);
    if (!cursor.find(rev)) {
      cursor = getSearchCursor(cm, state.query, rev ? CodeMirror.Pos(cm.lastLine()) : CodeMirror.Pos(cm.firstLine(), 0));
      if (!cursor.find(rev)) return;
    }
    cm.setSelection(cursor.from(), cursor.to());
    cm.scrollIntoView({from: cursor.from(), to: cursor.to()}, 20);
    state.posFrom = cursor.from(); state.posTo = cursor.to();
  });}

  function clearSearch(cm) {cm.operation(function() {
    var state = getSearchState(cm);
    state.lastQuery = state.query;
    if (!state.query) return;
    state.query = state.queryText = null;
    cm.removeOverlay(state.overlay);
    if (state.annotate) { state.annotate.clear(); state.annotate = null; }
  });}

  function replaceQueryDialog(cm){
    var rqd = cm.getOption('search') && cm.getOption('search').replaceQueryDialog;
    return rqd ||
      'Replace: <input type="text" style="width: 10em" class="CodeMirror-search-field"/> <span style="color: #888" class="CodeMirror-search-hint">(Use /re/ syntax for regexp search)</span>';
      
  }

  function replacementQueryDialog (cm){
    var rqd = cm.getOption('search') && cm.getOption('search').replacementQueryDialog;
    return rqd ||
      'With: <input type="text" style="width: 10em" class="CodeMirror-search-field"/>';
  }

  function doReplaceConfirm(cm) {
    var drc = cm.getOption('search') && cm.getOption('search').doReplaceConfirm;
    return drc || 
    "Replace? <button>Yes</button> <button>No</button> <button>Stop</button>";
  }

  function replace(cm, all) {
    if (cm.getOption("readOnly")) return;
    var query = cm.getSelection() || getSearchState(cm).lastQuery;
    dialog(cm, replaceQueryDialog(cm), "Replace:", query, function(query) {
      if (!query) return;
      query = parseQuery(query);
      dialog(cm, replacementQueryDialog(cm), "Replace with:", "", function(text) {
        if (all) {
          cm.operation(function() {
            for (var cursor = getSearchCursor(cm, query); cursor.findNext();) {
              if (typeof query != "string") {
                var match = cm.getRange(cursor.from(), cursor.to()).match(query);
                cursor.replace(text.replace(/\$(\d)/g, function(_, i) {return match[i];}));
              } else cursor.replace(text);
            }
          });
        } else {
          clearSearch(cm);
          var cursor = getSearchCursor(cm, query, cm.getCursor());
          var advance = function() {
            var start = cursor.from(), match;
            if (!(match = cursor.findNext())) {
              cursor = getSearchCursor(cm, query);
              if (!(match = cursor.findNext()) ||
                  (start && cursor.from().line == start.line && cursor.from().ch == start.ch)) return;
            }
            cm.setSelection(cursor.from(), cursor.to());
            cm.scrollIntoView({from: cursor.from(), to: cursor.to()});
            confirmDialog(cm, doReplaceConfirm(cm), "Replace?",
                          [function() {doReplace(match);}, advance]);
          };
          var doReplace = function(match) {
            cursor.replace(typeof query == "string" ? text :
                           text.replace(/\$(\d)/g, function(_, i) {return match[i];}));
            advance();
          };
          advance();
        }
      });
    });
  }

  CodeMirror.commands.find = function(cm) {clearSearch(cm); doSearch(cm);};
  CodeMirror.commands.findPersistent = function(cm) {clearSearch(cm); doSearch(cm, false, true);};
  CodeMirror.commands.findNext = doSearch;
  CodeMirror.commands.findPrev = function(cm) {doSearch(cm, true);};
  CodeMirror.commands.clearSearch = clearSearch;
  CodeMirror.commands.replace = replace;
  CodeMirror.commands.replaceAll = function(cm) {replace(cm, true);};
});
