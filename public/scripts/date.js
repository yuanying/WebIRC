var month_names = [ "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
var day_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function get_time(date) {
  var minutes = date.getMinutes()
  return date.getHours() + ":" + (minutes < 10 ? "0" + minutes : minutes)
}

function seconds_to_date(seconds_since_epoch) {
  var custom_date = new Date()
  if (seconds_since_epoch) {custom_date.setTime(seconds_since_epoch * 1000)}
  return custom_date
}

function get_brief_date(seconds_since_epoch) {
  var custom_date = seconds_to_date(seconds_since_epoch)
  return custom_date.getDate() + " " +  month_names[custom_date.getMonth()]
}

function timestamp_short(seconds_since_epoch) {
  return get_time(seconds_to_date(seconds_since_epoch))
}

function timestamp_long(seconds_since_epoch) {
  var custom_date = seconds_to_date(seconds_since_epoch)
  return day_names[custom_date.getDay()] + ", " +  month_names[custom_date.getMonth()] + " " + custom_date.getDate() + " at " + get_time(custom_date)
}
