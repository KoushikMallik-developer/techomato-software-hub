// Styles that define how slide content looks. Shared by the editor, the presenter and the HTML / PNG exporters.
export const SLIDE_CSS = `
.slide{font-family:Calibri,Carlito,"Segoe UI",Arial,sans-serif;-webkit-font-smoothing:antialiased}
.slide .el{box-sizing:border-box}
.slide .stext{width:100%;white-space:pre-wrap}
.slide .stext>div{min-height:1em;position:relative}
.slide .stext a{color:inherit;text-decoration:underline}
.slide .stext{counter-reset:n0 n1 n2 n3 n4 n5}
.slide .stext>div[data-bul]::before{position:absolute;left:calc(var(--bi,0) * 0.9em);}
.slide .stext>div[data-bul="dot"]::before{content:"\\2022";left:calc(var(--lv,0) * 0.9em)}
.slide .stext>div[data-bul="dot"][data-lvl="1"]::before{content:"\\2013";left:0.9em}
.slide .stext>div[data-bul="dot"][data-lvl="2"]::before{content:"\\25E6";left:1.8em}
.slide .stext>div[data-bul="dot"][data-lvl="3"]::before{content:"\\25AA";left:2.7em}
.slide .stext>div[data-bul="dot"][data-lvl="0"]::before{left:0}
.slide .stext>div[data-bul="num"]::before{left:calc(0em)}
.slide .stext>div[data-bul="num"][data-lvl="0"]{counter-increment:n0;counter-reset:n1 n2 n3}
.slide .stext>div[data-bul="num"][data-lvl="0"]::before{content:counter(n0) ".";left:0}
.slide .stext>div[data-bul="num"][data-lvl="1"]{counter-increment:n1;counter-reset:n2}
.slide .stext>div[data-bul="num"][data-lvl="1"]::before{content:counter(n1,lower-alpha) ".";left:0.9em}
.slide .stext>div[data-bul="num"][data-lvl="2"]{counter-increment:n2}
.slide .stext>div[data-bul="num"][data-lvl="2"]::before{content:counter(n2,lower-roman) ".";left:1.8em}
.slide .stext>div:not([data-bul="num"])[data-lvl="0"]{counter-reset:n0 n1 n2 n3}
.slide .sfoot{position:absolute;left:36px;right:36px;bottom:12px;display:flex;justify-content:space-between;font-size:14px;pointer-events:none}
.slide .stable td{vertical-align:middle}
.slide .stable .cellta{width:100%;height:100%;min-height:1.4em;border:0;outline:0;background:transparent;font:inherit;color:inherit;resize:none;padding:0;display:block}
.slide .phprompt{font-style:italic}
`;
