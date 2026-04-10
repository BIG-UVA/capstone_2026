# parameters
read_dir <- "/standard/harrislab/capstone_2026/raw_reads/GSE203655/"
fastp_location <- "~/fastp"

fastq1_end <- "R1_001.fastq.gz"
fastq2_end <- "R2_001.fastq.gz"

# get the fastq files
fastq1_files <- list.files(read_dir,
                           fastq1_end, full.names=T, recursive = T)

fastq2_files <- list.files(read_dir,
                           fastq2_end, full.names=T, recursive = T)


# make fastp out files
fp1_files <- gsub(".fastq.gz", ".fp_out.fastq.gz", fastq1_files)
fp2_files <- gsub(".fastq.gz", ".fp_out.fastq.gz", fastq2_files)


for (i in 1:length(fastq1_files)) {
  
  command <- paste0(fastp_location, 
                    " -i ", fastq1_files[i], 
                    " -I ", fastq2_files[i],
                    " -o ", fp1_files[i],
                    " -O ", fp2_files[i])
  
  print(command)
  
  system(command)
  
}
