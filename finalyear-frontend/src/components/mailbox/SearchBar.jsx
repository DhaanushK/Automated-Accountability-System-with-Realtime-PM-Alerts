import React from 'react';
import {
  Paper,
  InputBase,
  IconButton,
  Box
} from '@mui/material';
import {
  Search as SearchIcon,
  Clear as ClearIcon
} from '@mui/icons-material';

const SearchBar = ({ value, onChange, onSearch }) => {
  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch(value);
  };

  const handleClear = () => {
    onChange({ target: { value: '' } });
    onSearch('');
  };

  return (
    <Paper
      component="form"
      onSubmit={handleSubmit}
      sx={{
        p: '2px 4px',
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        mb: 2
      }}
    >
      <IconButton type="submit" sx={{ p: '10px' }} aria-label="search">
        <SearchIcon />
      </IconButton>
      
      <InputBase
        sx={{ ml: 1, flex: 1 }}
        placeholder="Search emails..."
        value={value}
        onChange={onChange}
      />
      
      {value && (
        <IconButton 
          sx={{ p: '10px' }}
          aria-label="clear"
          onClick={handleClear}
        >
          <ClearIcon />
        </IconButton>
      )}
    </Paper>
  );
};

export default SearchBar;