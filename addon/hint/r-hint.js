// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: http://codemirror.net/LICENSE

(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    mod(require("../../lib/codemirror"));
  else if (typeof define == "function" && define.amd) // AMD
    define(["../../lib/codemirror"], mod);
  else // Plain browser env
    mod(CodeMirror);
})(function(CodeMirror) {
  var Pos = CodeMirror.Pos;

  function forEach(arr, f) {
    for (var i = 0, e = arr.length; i < e; ++i) f(arr[i]);
  }

  function arrayContains(arr, item) {
    if (!Array.prototype.indexOf) {
      var i = arr.length;
      while (i--) {
        if (arr[i] === item) {
          return true;
        }
      }
      return false;
    }
    return arr.indexOf(item) != -1;
  }

  var atoms = ("NULL NA Inf NaN NA_integer_ NA_real_ NA_complex_ NA_character_").split(" ");
  var builtins = ("list quote bquote eval return call parse deparse abs " 
    + "sqrt ceiling floor trunc round signif cos log log10 exp substr substr "
    + "substr grep grep sub strsplit strsplit paste paste paste paste toupper "
    + "tolower dnorm plot pnorm pnorm qnorm qnorm rnorm dbinom pbinom qbinom "
    + "rbinom dpois ppois qpois rpois dunif punif qunif runif mean sd median "
    + "quantile range sum diff min max scale seq rep cut order attach detach "
    + "merge rbind aggregate print t c which subset table is.numeric is.character "
    + "is.vector is.matrix is.data.frame as.numeric as.character as.vector "
    + "as.matrix as.data.frame ").split(" ");
  var keywords = ("if else repeat while function for in next break ifelse").split(" ");

  function rHint(editor,options){
    var cur = editor.getCursor();
    var token = editor.getTokenAt(cur);

    if (/\b(?:string|comment)\b/.test(token.type)) return;
    token.state = CodeMirror.innerMode(editor.getMode(), token.state).state;

    if(token.end > cur.ch){
      token.end = cur.ch;
      token.string = token.string.slice(0, cur.ch - token.start);
    }

    var tabAuto = editor.options.extraKeys && 
      editor.options.extraKeys["Tab"] === "autocomplete";
    var list = token.string ? getCompletions(token,options):[];
    if( tabAuto && !list.length){
      list = [token.string+"\t"]
    }
    return {
      list:list,
      from:Pos(cur.line,token.start),
      to:Pos(cur.line,token.end)
    };
  }
  
  function getCompletions(token,options){
    var found = [], start = token.string;
    function maybeAdd(str) {
      if (str.indexOf(start) == 0 && !arrayContains(found, str)){
        found.push(str);
      }
    }
    
    forEach(atoms,maybeAdd);
    forEach(builtins,maybeAdd);
    forEach(keywords,maybeAdd);
    
    return found.sort();
  }
  CodeMirror.registerHelper("hint", "r", rHint);
});
