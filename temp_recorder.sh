#!/bin/bash
 
date=(`date +"%m/%d"`)
ndate=(`date +"%m%d"`)
time=(`date +"%H:%M"`)
temp=(`vcgencmd measure_temp`)
str=$date" "$time","${temp:5:-2}
echo $str >> "/var/www/html/temp/"$ndate"_temp_log.csv"
echo sudo chmod 777 "/var/www/html/temp/"$ndate"_temp_log.csv"