
var _callbacks_ = {
    'loadWords': function(rep){
        /* =========================
        Example Response from Google: 

        _callbacks_.loadWords(["SUCCESS",[["o",["哦","噢","喔","嚄","迲","筽"]]]])

        ["SUCCESS",[["sdsa",["岁的萨","上的","受到","说的","时代","速度","是","上","说","时"],[4,2,2,2,2,2,1,1,1,1],{"matched_length":[4,2,2,2,2,2,1,1,1,1]}]]]

        ========================= */
        var success = rep[0],
            reply = rep[1][0],
            word = reply[0],
            words = reply[1],
            lens = reply[2];

        if (typeof lens == 'undefined') {
            lens = new Array(words.length);
            for (var i = 0; i < lens.length; i++) {
                lens[i] = word.length;
            }
        }
        $.wordDatabase.setChoices(word, words, lens);
    }
};

(function($){

    function Word(name, choices, options){
        var self = this;

        self.defaultOptions = {
            pending: false,
            length: choices.length
        };

        self.name = name;
        self.choices = $.extend(true, [], choices);
        self.lens = []; // matched lengths
        self.num = (typeof options.num == 'undefined') ? choices.length : options.num;
        self.options = $.extend({}, self.defaultOptions, options);
        self.pending = self.options.pending;

        self.setChoices = function(choices, lens){
            self.choices = $.extend(true, [], choices);
            self.lens = lens;
            self.pending = false;
            //self.num = self.choices.length;
        }

    }

    function WordDatabase(){
        var self = this;
        self.words = {};
        self.loading = {};
        self.traditional = false; // convert simplified to traditional if true

        self.getChoices = function(word){
            var word = self.words[word];
            if (word){
                return word.choices;
            }
            return [];
        }

        self.getLength = function(word, choice) {
            var word = self.words[word];
            if (word){
                return word.lens[choice];
            }
            return word.length;
        }

        self.hasWord = function(word, num){
            hasWord = (self.words.hasOwnProperty(word) && self.words[word].num >= num);
            if (hasWord && self.words[word].pending === true){
                return true;
            }
            return hasWord;
        }

        self.addWord = function(word, num){
            num = (typeof num == 'undefined' ? 10 : num);
            self.words[word] = new Word(word, [], {pending: true, num: num});
        };

        self.setChoices = function(word, choices, lens, options){
            if (word.length > 0 && choices instanceof Array && self.words[word]) {
                wordObj = self.words[word];
                if (self.traditional && typeof $.toTraditional !== 'undefined') {
                    var convert = function(simpArray){
                        var ar = [];

                        for (var i = 0; i < simpArray.length; i++) {
                            var fullWord = $.toTraditional(simpArray[i]);
                            ar.push(fullWord);
                        }
                        return ar;
                    }
                    choices = convert(choices);
                }
                if (wordObj.pending === true) {
                    if (choices.length < wordObj.num) { 
                        // we've reached the end of the pages,
                        // so add a stop word to indicate that
                        choices.push(word);
                        lens.push(word.length);
                    }
                }
                wordObj.setChoices(choices, lens);

                return self.words[word];
            }
            return false;
        };
    };

    $.wordDatabase = new WordDatabase();

    $.fn.extend({
        insertAtCaret: function(myValue){
          return this.each(function(i) {
            if (document.selection) {
              //For browsers like Internet Explorer
              this.focus();
              sel = document.selection.createRange();
              sel.text = myValue;
              this.focus();
            }
            else if (this.selectionStart || this.selectionStart == '0') {
              //For browsers like Firefox and Webkit based
              var startPos = this.selectionStart;
              var endPos = this.selectionEnd;
              var scrollTop = this.scrollTop;
              this.value = this.value.substring(0, startPos)+myValue+this.value.substring(endPos,this.value.length);
              this.focus();
              this.selectionStart = startPos + myValue.length;
              this.selectionEnd = startPos + myValue.length;
              this.scrollTop = scrollTop;
            } else {
              this.value += myValue;
              this.focus();
            }
          })
        }
    });

    $.chineseInput = function(el, options){
        // To avoid scope issues, use 'self' instead of 'this'
        // to reference this class from internal events and functions.
        var self = this;
        
        // Access to jQuery and DOM versions of element
        self.$el = $(el);
        self.el = el;

        self.id = String(parseInt(Math.random() * 10000) * parseInt(Math.random() * 10000));

         // Set null options object if no options are provided
        if(!options || typeof options !== 'object') options = {};

         // Sanitize option data
        if(typeof options.input !== 'object') options.input = {initial: 'simplified', allowChange: true};
        if(typeof options.input.initial !== 'string') options.input.initial = 'simplified';
        if(options.input.initial.toLowerCase() != 'simplified' && options.input.initial.toLowerCase() != 'traditional') options.input.initial = 'simplified';
        options.active = options.active == true;
        options.input.allowChange = options.input.allowChange == true; // set it to boolean value true if it evaluates to true
        options.allowHide = options.allowHide == true;


        self.currentText = '';
        self.currentPage = 0; // page of given options
        self.currentSelection = 1; // current selection on the current page (normally 1-5)
        self.lastPage = false; // are we at the last page of options?
        //self.options = [];
        self.html = '<span class="typing"></span><ul class="options"></ul>';
        self.url = 'http://www.google.com/inputtools/request?ime=pinyin&ie=utf-8&oe=utf-8&app=translate&uv'
        self.paramNames = {'text': 'text',
                           'num': 'num',
                           'callback': 'cb'}
        self.defaultNum = 10; // default number of options to load
        
        // Add a reverse reference to the DOM object
        self.$el.data("chineseInput", self);
        
        self.init = function(){
            
            self.options = $.extend({},$.chineseInput.defaultOptions, options);
            
            // Further initialization

            self.$el.keydown(self.keyDown);
            self.$el.keypress(self.keyPress);

            self.$active = $('<label class="chinese-checkbox" for="check_' + self.id + '"><input type="checkbox"' + (self.options.active ? ' checked="checked"' : '')+ ' id="check_' + self.id + '"/> phonetic typing</label>');

            if (self.options.allowHide) {
                
                var $hide = self.$active;
                $hide.insertAfter(self.$el);
                $hide.css({'position': 'absolute', 'z-index': 1000}).show();
                self.reposition($hide);
                $hide.find('input').click(function(){
                    self.options.active = $(this).is(':checked');
                    if (self.options.active === false){
                        self.currentText = '';
                        self.currentPage = 0;
                        self.updateDialog();
                    }
                    self.$el.focus();
                });
            }

            if (self.options.input.initial == 'traditional'){
                $.wordDatabase.traditional = true;
            }

            $(window).resize($.proxy(function() {
                this.self.updateDialog();
                this.self.reposition();
            }, {'self': self}));
        };
        
        self.keyDown = function(event){
            if (self.options.active) {
                if (self.currentText.length > 0){
                    switch(event.which){
                        case 37: // left 
                            self.previousChoice();
                            return false;
                        case 39: // right
                            self.nextChoice();
                            return false;
                    }
                }
                switch(event.which){
                    case 8: // backspace
                        if (self.currentText.length > 0){
                            self.currentText = self.currentText.substring(0,self.currentText.length-1);
                            self.updateDialog();
                            break;
                        }
                    default:
                        return true; // continue with keypress if one of the above criteria not met
                }
                event.preventDefault();
                return false;
            }
        };

        self.keyPress = function(event){
            if (self.options.active) {
                var key = String.fromCharCode(event.which);
                var pat = /[a-zA-Z]/;
                if (pat.test(key)){ 
                    // pressed a character
                    if (self.currentText.length <= 20){ 
                        // set maximum num characters to arbitrary 20 limit
                        self.currentText += key;
                    }
                } else if (self.currentText.length > 0) {
                    if (key == ' '){ 
                        // pressed space
                        self.makeSelection(self.currentSelection - 1);
                    } else if (event.which >= 49 && event.which <= 53) { 
                        // pressed number between 1 and 5
                        self.makeSelection(event.which - 49);
                    } else if (key == ',') { // go to previous page
                        self.previousPage();
                    } else if (key == '.') { // go to next page
                        self.nextPage();
                    }
                } else {
                    if (key == '.') { // pressed period
                        self.addText('\u3002');
                        return false;
                    }
                    return true;
                }
                self.updateDialog();

                event.preventDefault();
                return false;
            }
        };

        self.addText = function(text){
            self.$el.insertAtCaret(text);
        };

        self.nextPage = function(){                
            if (!self.lastPage) {
                self.currentPage += 1;
            }
            self.updateDialog();
        }

        self.previousPage = function(){
            self.currentPage = parseInt(Math.max(0, self.currentPage - 1));
            self.lastPage = false;
            self.updateDialog();
        }

        self.nextChoice = function(){
            if (self.currentSelection < 5) {
                self.currentSelection += 1;
                self.updateDialog();
            } else {
                self.currentSelection = 1;
                self.nextPage(); 
            }
        }

        self.previousChoice = function(){
            if (self.currentSelection > 1) {
                self.currentSelection -= 1;
                self.updateDialog();
            } else if (self.currentPage > 0) {
                self.currentSelection = 5;
                self.previousPage(); 
            }
        }

        self.makeSelection = function(selectionIndex){
            var choices = $.wordDatabase.getChoices(self.currentText);
            selectionIndex += self.currentPage * 5; // add current page to index
            if (selectionIndex < 0) { 
                // if selection is smaller than zero, we use the text input as is, effectively canceling smart input
                self.addText(self.currentText);
                self.currentText = '';
                self.currentPage = 0;
                self.currentSelection = 1;
                self.lastPage = false;
            }
            if (choices && selectionIndex < choices.length){
                choice = choices[selectionIndex];
                len = $.wordDatabase.getLength(self.currentText, selectionIndex);
                self.addText(choice);
                self.currentText = '' + self.currentText.substring(len);
                self.currentPage = 0;
                self.currentSelection = 1;
                self.lastPage = false;
            }

        };

        self.reposition = function($el){
            var $hide = $el;
            if (!$hide){
                $hide = self.$active;
            }
            $hide.position({my: 'left bottom',
                                at: 'left bottom',
                                of: self.$el,
                                collision: "none"});
        }

        self.updateDialog = function(){
            if (self.currentText.length > 0) {
                var options = self.getOptionsFromDatabase(self.currentText, self.currentPage);
                if (options && options.length){
                    var $box = $('#chinese-ime');
                    if (!$box.size()){
                        $box = $(document.createElement('div')).draggable().
                                attr({'id': 'chinese-ime'}).
                                html(self.html)
                        $('body').append($box);
                    }
                    $box.find('.typing').text(self.currentText);
                    var lis = [];
                    for (var i = 0; i < 5 && i < options.length; i++) {
                        lis.push('<li ' + (i + 1 == self.currentSelection ? 'class="current"' : '') + '> ' + (i + 1) + '. ' + options[i] +'</li>');
                    }
                    $box.find('ul').html(lis.join('\n'));
                    $box.show();
                    var caretPosition = self.$el.getCaretPosition();
                    $box.css({
                        position: 'absolute',
                        left: self.$el.offset().left + caretPosition.left,
                        top: self.$el.offset().top + caretPosition.top
                    });
                } else { // load options with ajax
                    self.callAjax(self.currentText, self.currentPage);
                }
            } else {
                var $box = $('#chinese-ime').hide();
            }
        };

        self.getOptionsFromDatabase = function(text, page, num){
            if (typeof page == 'undefined') { page = self.currentPage; }
            if (typeof num == 'undefined') { num = 5; }
            var options = $.wordDatabase.getChoices(text);
            if (options && options.length >= (page + 1) * num) {
                // we have options in the database already, and enough of them
                return options.slice(page*num, (page+1)*num);
            } else if (options && options[options.length-1] == text) {
                // if the last option is the text itself, it means we've exhausted all suggestions
                self.lastPage = true;
                return options.slice(page*num);
            }
            return false; // we need to call ajax first
        };
        
        self.callAjax = function(text, page, num, callback){
            var params = {};
            num = (typeof num == 'undefined' ? self.defaultNum : num);
            num = num + parseInt(Math.floor(page / 2)) * num;
            params[self.paramNames['text']] = text;
            params[self.paramNames['num']] = num; // assuming page length is 10 here

            if (typeof callback != 'undefined') {
                params[self.paramNames['callback']] = callback;
            } else {
                params[self.paramNames['callback']] = '_callbacks_.loadWords';
            }
            if (!$.wordDatabase.hasWord(text, num)){
                $.wordDatabase.addWord(text, num);
                
                $.get(self.url, params, $.proxy(function(response, success){
                    self.updateDialog();
                }, {'text': text, 'page': page, 'num': num, 'callback': callback}), 'script');
            }
        };

        // Run initializer
        self.init();
    };
    
    $.chineseInput.defaultOptions = {
        debug: false
    };
    
    $.fn.chineseInput = function(options){
        return this.each(function(){
            (new $.chineseInput(this, options));
        });
    };
    
})(jQuery);
