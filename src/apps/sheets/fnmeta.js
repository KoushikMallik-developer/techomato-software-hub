// Function signatures, descriptions and categories for hints, autocomplete and the "Insert function" dialog.
// Line format:  NAME(arg1, arg2, ...)  - description    (a trailing "..." argument repeats)
const TABLE = {
  Math: `SUM(number1, number2, ...) - Adds numbers and ranges
SUMIF(range, criteria, [sum_range]) - Adds cells that meet a condition
SUMIFS(sum_range, criteria_range1, criteria1, ...) - Adds cells that meet several conditions
SUMPRODUCT(array1, [array2], ...) - Multiplies arrays and adds the results
SUMSQ(number1, ...) - Sum of squares
PRODUCT(number1, ...) - Multiplies numbers
ABS(number) - Absolute value
SIGN(number) - Sign of a number (-1, 0, 1)
ROUND(number, digits) - Rounds to a number of digits
ROUNDUP(number, digits) - Rounds away from zero
ROUNDDOWN(number, digits) - Rounds toward zero
TRUNC(number, [digits]) - Cuts off decimals
INT(number) - Rounds down to an integer
MOD(number, divisor) - Remainder after division
QUOTIENT(numerator, denominator) - Integer part of a division
POWER(base, exponent) - Raises a number to a power
SQRT(number) - Square root
EXP(number) - e raised to a power
LN(number) - Natural logarithm
LOG(number, [base]) - Logarithm
LOG10(number) - Base-10 logarithm
PI() - The value of pi
CEILING(number, significance) - Rounds up to a multiple
FLOOR(number, significance) - Rounds down to a multiple
MROUND(number, multiple) - Rounds to the nearest multiple
EVEN(number) - Rounds up to the next even integer
ODD(number) - Rounds up to the next odd integer
FACT(number) - Factorial
COMBIN(n, k) - Number of combinations
PERMUT(n, k) - Number of permutations
GCD(number1, ...) - Greatest common divisor
LCM(number1, ...) - Least common multiple
RAND() - Random number between 0 and 1
RANDBETWEEN(low, high) - Random integer between two values
RANDARRAY([rows], [cols], [min], [max], [whole]) - Array of random numbers
SIN(angle) - Sine
COS(angle) - Cosine
TAN(angle) - Tangent
ASIN(value) - Inverse sine
ACOS(value) - Inverse cosine
ATAN(value) - Inverse tangent
ATAN2(x, y) - Angle from x and y coordinates
DEGREES(radians) - Radians to degrees
RADIANS(degrees) - Degrees to radians
SUBTOTAL(function_num, range1, ...) - Subtotal that can ignore hidden rows
AGGREGATE(function_num, options, ref1, ...) - Aggregate with error and hidden-row options
MMULT(array1, array2) - Matrix product
MDETERM(array) - Matrix determinant
MINVERSE(array) - Matrix inverse
MUNIT(n) - Identity matrix
SEQUENCE(rows, [cols], [start], [step]) - Array of sequential numbers
ROMAN(number, [form]) - Number to Roman numerals
ARABIC(text) - Roman numerals to number
BASE(number, radix, [min_length]) - Number to text in a base
DECIMAL(text, radix) - Text in a base to number
BITAND(a, b) - Bitwise AND
BITOR(a, b) - Bitwise OR
BITXOR(a, b) - Bitwise XOR`,
  Statistical: `AVERAGE(number1, ...) - Mean of numbers
AVERAGEA(value1, ...) - Mean including text and logicals
AVERAGEIF(range, criteria, [average_range]) - Mean of cells that meet a condition
AVERAGEIFS(average_range, criteria_range1, criteria1, ...) - Mean with several conditions
COUNT(value1, ...) - Counts numbers
COUNTA(value1, ...) - Counts non-empty cells
COUNTBLANK(range) - Counts empty cells
COUNTIF(range, criteria) - Counts cells that meet a condition
COUNTIFS(criteria_range1, criteria1, ...) - Counts with several conditions
COUNTUNIQUE(value1, ...) - Counts distinct values
MAX(number1, ...) - Largest value
MIN(number1, ...) - Smallest value
MAXIFS(max_range, criteria_range1, criteria1, ...) - Largest value that meets conditions
MINIFS(min_range, criteria_range1, criteria1, ...) - Smallest value that meets conditions
MEDIAN(number1, ...) - Middle value
MODE(number1, ...) - Most frequent value
LARGE(array, k) - k-th largest value
SMALL(array, k) - k-th smallest value
RANK(number, ref, [order]) - Rank of a number in a list
PERCENTILE(array, k) - k-th percentile
QUARTILE(array, quart) - Quartile of a data set
PERCENTRANK(array, x, [significance]) - Relative rank of a value
STDEV(number1, ...) - Sample standard deviation
STDEV.S(number1, ...) - Sample standard deviation
STDEV.P(number1, ...) - Population standard deviation
VAR(number1, ...) - Sample variance
VAR.S(number1, ...) - Sample variance
VAR.P(number1, ...) - Population variance
CORREL(array1, array2) - Correlation coefficient
COVARIANCE.S(array1, array2) - Sample covariance
SLOPE(known_y, known_x) - Slope of the regression line
INTERCEPT(known_y, known_x) - Intercept of the regression line
RSQ(known_y, known_x) - R-squared of the regression
FORECAST(x, known_y, known_x) - Predicts a value along a linear trend
TREND(known_y, [known_x], [new_x]) - Linear trend values
GROWTH(known_y, [known_x], [new_x]) - Exponential trend values
LINEST(known_y, [known_x], [const], [stats]) - Linear regression statistics
GEOMEAN(number1, ...) - Geometric mean
HARMEAN(number1, ...) - Harmonic mean
TRIMMEAN(array, percent) - Mean excluding outliers
SKEW(number1, ...) - Skewness
KURT(number1, ...) - Kurtosis
FREQUENCY(data, bins) - Frequency distribution
NORM.DIST(x, mean, sd, cumulative) - Normal distribution
NORM.INV(probability, mean, sd) - Inverse normal distribution
NORM.S.DIST(z, cumulative) - Standard normal distribution
STANDARDIZE(x, mean, sd) - Normalised value
BINOM.DIST(successes, trials, probability, cumulative) - Binomial distribution
POISSON.DIST(x, mean, cumulative) - Poisson distribution
EXPON.DIST(x, lambda, cumulative) - Exponential distribution
T.DIST(x, df, cumulative) - Student t distribution
T.TEST(array1, array2, tails, type) - Student t-test probability
CHISQ.DIST(x, df, cumulative) - Chi-squared distribution
CONFIDENCE.NORM(alpha, sd, size) - Confidence interval half-width`,
  Logical: `IF(condition, value_if_true, [value_if_false]) - Chooses between two values
IFS(condition1, value1, ...) - First value whose condition is true
IFERROR(value, value_if_error) - Replaces errors
IFNA(value, value_if_na) - Replaces #N/A
AND(logical1, ...) - TRUE if all arguments are true
OR(logical1, ...) - TRUE if any argument is true
NOT(logical) - Reverses a logical value
XOR(logical1, ...) - Exclusive OR
SWITCH(expression, case1, value1, ..., [default]) - Matches a value against cases
TRUE() - The logical value TRUE
FALSE() - The logical value FALSE
LET(name1, value1, ..., calculation) - Names intermediate results
LAMBDA(parameter1, ..., calculation) - Creates a custom function
MAP(array1, lambda) - Applies a function to each element
REDUCE(initial, array, lambda) - Folds an array into one value
SCAN(initial, array, lambda) - Running fold of an array
BYROW(array, lambda) - Applies a function to each row
BYCOL(array, lambda) - Applies a function to each column
MAKEARRAY(rows, cols, lambda) - Builds an array from a function
ISBLANK(value) - TRUE if the cell is empty
ISNUMBER(value) - TRUE if the value is a number
ISTEXT(value) - TRUE if the value is text
ISERROR(value) - TRUE if the value is any error
ISERR(value) - TRUE if the value is an error except #N/A
ISNA(value) - TRUE if the value is #N/A
ISLOGICAL(value) - TRUE if the value is TRUE or FALSE
ISEVEN(number) - TRUE if the number is even
ISODD(number) - TRUE if the number is odd
ISFORMULA(reference) - TRUE if the cell has a formula
NA() - Returns #N/A
N(value) - Converts a value to a number
TYPE(value) - Type of a value`,
  Text: `CONCAT(text1, ...) - Joins text
CONCATENATE(text1, ...) - Joins text
TEXTJOIN(delimiter, ignore_empty, text1, ...) - Joins text with a delimiter
LEFT(text, [count]) - First characters of text
RIGHT(text, [count]) - Last characters of text
MID(text, start, count) - Characters from the middle of text
LEN(text) - Length of text
UPPER(text) - Upper case
LOWER(text) - Lower case
PROPER(text) - Capitalises each word
TRIM(text) - Removes extra spaces
CLEAN(text) - Removes non-printable characters
SUBSTITUTE(text, old, new, [instance]) - Replaces text
REPLACE(text, start, count, new) - Replaces part of text by position
FIND(find, within, [start]) - Position of text (case sensitive)
SEARCH(find, within, [start]) - Position of text (case insensitive)
EXACT(text1, text2) - TRUE if two texts are identical
REPT(text, times) - Repeats text
TEXT(value, format) - Formats a value as text
VALUE(text) - Converts text to a number
NUMBERVALUE(text, [decimal], [group]) - Converts text to a number
FIXED(number, [decimals], [no_commas]) - Formats a number as text
DOLLAR(number, [decimals]) - Formats a number as currency text
CHAR(number) - Character for a code
CODE(text) - Code of the first character
UNICHAR(number) - Unicode character
UNICODE(text) - Unicode code of the first character
SPLIT(text, delimiter, [split_by_each], [remove_empty]) - Splits text into cells
TEXTSPLIT(text, col_delimiter, [row_delimiter]) - Splits text into an array
TEXTBEFORE(text, delimiter, [instance]) - Text before a delimiter
TEXTAFTER(text, delimiter, [instance]) - Text after a delimiter
REGEXMATCH(text, regex) - TRUE if the text matches a pattern
REGEXEXTRACT(text, regex) - Extracts the first match
REGEXREPLACE(text, regex, replacement) - Replaces matches
JOIN(delimiter, array1, ...) - Joins values with a delimiter
ARRAYTOTEXT(array, [format]) - Array as text
HYPERLINK(url, [label]) - Creates a link
SPARKLINE(data, [options]) - Draws a small chart in a cell
IMAGE(url) - Shows an image from a URL`,
  'Date & time': `TODAY() - Today's date
NOW() - Current date and time
DATE(year, month, day) - Builds a date
TIME(hour, minute, second) - Builds a time
YEAR(date) - Year of a date
MONTH(date) - Month of a date
DAY(date) - Day of a date
HOUR(time) - Hour of a time
MINUTE(time) - Minute of a time
SECOND(time) - Second of a time
WEEKDAY(date, [type]) - Day of the week
WEEKNUM(date, [type]) - Week number
ISOWEEKNUM(date) - ISO week number
DATEVALUE(text) - Converts text to a date
TIMEVALUE(text) - Converts text to a time
EDATE(start, months) - Date a number of months away
EOMONTH(start, months) - End of month a number of months away
DATEDIF(start, end, unit) - Difference between two dates
DAYS(end, start) - Days between two dates
DAYS360(start, end, [method]) - Days on a 360-day year
YEARFRAC(start, end, [basis]) - Fraction of a year between dates
NETWORKDAYS(start, end, [holidays]) - Working days between dates
WORKDAY(start, days, [holidays]) - Date a number of working days away
NETWORKDAYS.INTL(start, end, [weekend], [holidays]) - Working days with custom weekends
WORKDAY.INTL(start, days, [weekend], [holidays]) - Working day with custom weekends`,
  Lookup: `VLOOKUP(search_key, range, index, [is_sorted]) - Looks up a value in the first column
HLOOKUP(search_key, range, index, [is_sorted]) - Looks up a value in the first row
XLOOKUP(search_key, lookup_range, result_range, [if_not_found], [match_mode], [search_mode]) - Flexible lookup
XMATCH(search_key, lookup_range, [match_mode], [search_mode]) - Position of a value
LOOKUP(search_key, search_range, [result_range]) - Simple lookup
MATCH(search_key, range, [match_type]) - Position of a value in a range
INDEX(range, [row], [col]) - Value at a position in a range
CHOOSE(index, choice1, choice2, ...) - Picks from a list by index
OFFSET(reference, rows, cols, [height], [width]) - Reference shifted from a start
INDIRECT(text) - Reference from text
ADDRESS(row, col, [abs], [a1], [sheet]) - Cell address as text
ROW([reference]) - Row number
COLUMN([reference]) - Column number
ROWS(range) - Number of rows
COLUMNS(range) - Number of columns
TRANSPOSE(array) - Swaps rows and columns
FILTER(range, condition1, ...) - Rows that meet conditions
SORT(range, [sort_column], [ascending], ...) - Sorts a range
SORTBY(range, by_range1, [order1], ...) - Sorts by other ranges
UNIQUE(range, [by_col], [exactly_once]) - Distinct rows
HSTACK(array1, ...) - Joins arrays side by side
VSTACK(array1, ...) - Joins arrays top to bottom
TAKE(array, rows, [cols]) - First or last rows and columns
DROP(array, rows, [cols]) - Removes rows and columns
CHOOSECOLS(array, col1, ...) - Picks columns
CHOOSEROWS(array, row1, ...) - Picks rows
TOCOL(array, [ignore], [scan_by_col]) - Array to one column
TOROW(array, [ignore], [scan_by_col]) - Array to one row
WRAPROWS(vector, count, [pad]) - Wraps a vector into rows
WRAPCOLS(vector, count, [pad]) - Wraps a vector into columns
EXPAND(array, rows, [cols], [pad]) - Expands an array
FLATTEN(range1, ...) - All values as one column
ARRAYFORMULA(formula) - Applies a formula to a whole array
SHEET([value]) - Sheet number
SHEETS([reference]) - Number of sheets`,
  Financial: `PMT(rate, nper, pv, [fv], [type]) - Loan payment
IPMT(rate, per, nper, pv, [fv], [type]) - Interest part of a payment
PPMT(rate, per, nper, pv, [fv], [type]) - Principal part of a payment
FV(rate, nper, pmt, [pv], [type]) - Future value
PV(rate, nper, pmt, [fv], [type]) - Present value
NPER(rate, pmt, pv, [fv], [type]) - Number of periods
RATE(nper, pmt, pv, [fv], [type], [guess]) - Interest rate per period
NPV(rate, value1, ...) - Net present value
IRR(values, [guess]) - Internal rate of return
XNPV(rate, values, dates) - Net present value with dates
XIRR(values, dates, [guess]) - Internal rate of return with dates
MIRR(values, finance_rate, reinvest_rate) - Modified internal rate of return
SLN(cost, salvage, life) - Straight-line depreciation
SYD(cost, salvage, life, period) - Sum-of-years depreciation
DB(cost, salvage, life, period, [month]) - Declining-balance depreciation
DDB(cost, salvage, life, period, [factor]) - Double-declining depreciation
EFFECT(nominal, periods) - Effective annual rate
NOMINAL(effective, periods) - Nominal annual rate
CUMIPMT(rate, nper, pv, start, end, type) - Cumulative interest
CUMPRINC(rate, nper, pv, start, end, type) - Cumulative principal
RRI(nper, pv, fv) - Equivalent growth rate
PDURATION(rate, pv, fv) - Periods to reach a value`,
  Engineering: `CONVERT(number, from_unit, to_unit) - Converts units
DEC2BIN(number, [places]) - Decimal to binary
DEC2HEX(number, [places]) - Decimal to hexadecimal
DEC2OCT(number, [places]) - Decimal to octal
BIN2DEC(number) - Binary to decimal
HEX2DEC(number) - Hexadecimal to decimal
OCT2DEC(number) - Octal to decimal
ERF(lower, [upper]) - Error function
GAMMALN(x) - Natural log of the gamma function`,
};

export const FN_CATEGORIES = Object.keys(TABLE);
const BY_NAME = new Map();
export const FN_LIST = [];
Object.entries(TABLE).forEach(([cat, text]) => {
  text.split('\n').forEach((line) => {
    const m = /^([A-Z0-9._]+)\((.*?)\) - (.*)$/.exec(line);
    if (!m) return;
    const rep = /\.\.\.$/.test(m[2].trim());
    const args = m[2].split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/^\.\.\.$/, 'value'));
    const info = { name: m[1], args, desc: m[3], cat, rep, sig: `${m[1]}(${m[2]})` };
    BY_NAME.set(m[1], info);
    FN_LIST.push(info);
  });
});
export const FN_SIGS = (name) => BY_NAME.get(String(name).toUpperCase()) || null;
