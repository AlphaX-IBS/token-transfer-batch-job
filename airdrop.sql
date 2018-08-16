CREATE TABLE airdrop.airdrop_addresses
(
	to_address varchar(60) CHARACTER SET utf8 NOT NULL
	,	gex	int(11) NOT NULL
    ,	status	tinyint(4) DEFAULT NULL
    , 	valid bool DEFAULT NULL
    ,	PRIMARY KEY (to_address) 
)